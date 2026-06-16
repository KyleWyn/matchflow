import { computed, onMounted, ref, watch } from 'vue';
import {
  createDefaultTeamNames,
  createDefaultVenueNames,
  createTeams,
  createVenues,
  generatePlannedSchedule,
  generatePlayoffSchedule,
  getTeamIds,
  normalizeTeamNames,
  normalizeVenueNames,
  pickNextMatch,
} from '../utils/schedule';
import { createTeamStats, sortTeamRows, withRanks } from '../utils/ranking';

const STORAGE_KEY = 'matchflow-state-v1';

export function useMatchScheduler() {
  const leagueTeamCount = ref(5);
  const leagueVenueCount = ref(2);
  const leagueTeamNames = ref(createDefaultTeamNames(leagueTeamCount.value));
  const leagueVenueNames = ref(createDefaultVenueNames(leagueVenueCount.value));
  const playoffVenueCount = ref(2);
  const playoffVenueNames = ref(createDefaultVenueNames(playoffVenueCount.value));
  const matches = ref([]);
  const leagueVenues = ref([]);
  const playoffVenues = ref([]);
  const recentTeamsByStage = ref({ league: [], playoff: [] });
  const restoredFromStorage = ref(false);
  const scoreModalOpen = ref(false);
  const finishingVenueId = ref(null);
  const finishingStage = ref('league');
  const scoringMatchId = ref(null);
  const scoreA = ref(0);
  const scoreB = ref(0);
  const skippedMatchIdsByVenue = ref({ league: {}, playoff: {} });
  const dynamicMatchIdsByVenue = ref({ league: {}, playoff: {} });
  const playoffAdvanceCount = ref(4);
  const manualPlayoffNames = ref(createDefaultTeamNames(4));

  const hasSchedule = computed(() => matches.value.length > 0);
  const leagueMatches = computed(() =>
    matches.value.filter((match) => (match.stage ?? 'league') === 'league'),
  );
  const playoffMatches = computed(() =>
    matches.value.filter((match) => match.stage === 'playoff'),
  );
  const hasLeagueSchedule = computed(() => leagueMatches.value.length > 0);
  const hasPlayoffSchedule = computed(() => playoffMatches.value.length > 0);

  const leagueActiveMatches = computed(() => getActiveMatches(leagueVenues.value));
  const playoffActiveMatches = computed(() => getActiveMatches(playoffVenues.value));
  const activeMatches = computed(() => [
    ...leagueActiveMatches.value,
    ...playoffActiveMatches.value,
  ]);

  const leagueWaitingMatches = computed(() =>
    leagueMatches.value.filter((match) => match.status === 'pending'),
  );
  const playoffWaitingMatches = computed(() =>
    playoffMatches.value.filter((match) => match.status === 'pending'),
  );
  const waitingMatches = computed(() => [
    ...leagueWaitingMatches.value,
    ...playoffWaitingMatches.value,
  ]);

  const completedMatches = computed(() =>
    matches.value.filter((match) => match.status === 'completed'),
  );
  const completedLeagueMatches = computed(() =>
    leagueMatches.value.filter((match) => match.status === 'completed'),
  );
  const isLeagueComplete = computed(() =>
    leagueMatches.value.length > 0 &&
    leagueMatches.value.every((match) => match.status === 'completed'),
  );
  const rankedLeagueTeams = computed(() => {
    const rows = createTeamStats(leagueTeamNames.value, completedLeagueMatches.value);
    return withRanks(
      sortTeamRows(rows, 'wins-diff-head-to-head', leagueMatches.value),
      'wins-diff-head-to-head',
      leagueMatches.value,
    );
  });
  const playoffFinalStandings = computed(() => getPlayoffFinalStandings());

  const currentScoringMatch = computed(() => {
    if (scoringMatchId.value) return getMatchById(scoringMatchId.value);

    const venue = getVenueStore(finishingStage.value).value.find((item) => item.id === finishingVenueId.value);
    return getMatchById(venue?.currentMatchId);
  });

  const progressPercent = computed(() => {
    if (!matches.value.length) return 0;
    return Math.round((completedMatches.value.length / matches.value.length) * 100);
  });
  const leagueProgressPercent = computed(() => getStageProgressPercent(leagueMatches.value));
  const playoffProgressPercent = computed(() => getStageProgressPercent(playoffMatches.value));

  const summary = computed(() => [
    { label: '总比赛', value: matches.value.length },
    { label: '进行中', value: activeMatches.value.length },
    { label: '待比赛', value: waitingMatches.value.length },
    { label: '已完成', value: completedMatches.value.length },
  ]);

  const leagueSummary = computed(() => createStageSummary(
    leagueMatches.value,
    leagueActiveMatches.value,
    leagueWaitingMatches.value,
  ));

  const playoffSummary = computed(() => createStageSummary(
    playoffMatches.value,
    playoffActiveMatches.value,
    playoffWaitingMatches.value,
  ));

  const leagueVenueRecommendations = computed(() =>
    createVenueRecommendations('league', leagueMatches.value, leagueVenues.value),
  );

  const playoffVenueRecommendations = computed(() =>
    createVenueRecommendations('playoff', playoffMatches.value, playoffVenues.value),
  );

  const venueRecommendations = computed(() => leagueVenueRecommendations.value);

  function createVenueRecommendations(stage, stageMatches, stageVenues) {
    return createPlannedVenueRecommendations(stage, stageMatches, stageVenues);
  }

  function createPlannedVenueRecommendations(stage, stageMatches, stageVenues) {
    return stageVenues.reduce((recommendations, venue) => {
      if (venue.currentMatchId) return recommendations;

      const dynamicMatch = getDynamicVenueMatch(stage, venue.id);
      if (dynamicMatch) {
        recommendations[venue.id] = dynamicMatch;
        return recommendations;
      }

      const skippedMatchIdSet = new Set(skippedMatchIdsByVenue.value[stage]?.[venue.id] ?? []);
      const plannedCandidates = getPlannedVenueCandidates(stageMatches, venue.id);
      const nextMatch =
        plannedCandidates.find((match) => !skippedMatchIdSet.has(match.id)) ??
        plannedCandidates[0];

      if (nextMatch) {
        recommendations[venue.id] = nextMatch;
      }

      return recommendations;
    }, {});
  }

  function getPlannedVenueCandidates(stageMatches, venueId) {
    return stageMatches
      .filter(
        (match) =>
          match.status === 'pending' &&
          match.plannedVenueId === venueId,
      )
      .sort(
        (left, right) =>
          (left.plannedRound ?? 0) - (right.plannedRound ?? 0) ||
          (left.plannedOrder ?? left.order) - (right.plannedOrder ?? right.order),
      );
  }

  function getDynamicVenueMatch(stage, venueId) {
    const matchId = dynamicMatchIdsByVenue.value[stage]?.[venueId];
    const match = getMatchById(matchId);
    return match?.status === 'pending' ? match : null;
  }

  function getMatchById(matchId) {
    return matches.value.find((match) => match.id === matchId) ?? null;
  }

  function getActiveMatches(stageVenues) {
    return stageVenues
      .map((venue) => ({
        venue,
        match: getMatchById(venue.currentMatchId),
      }))
      .filter((item) => item.match);
  }

  function createStageSummary(stageMatches, stageActiveMatches, stageWaitingMatches) {
    const completed = stageMatches.filter((match) => match.status === 'completed');
    return [
      { label: '总比赛', value: stageMatches.length },
      { label: '进行中', value: stageActiveMatches.length },
      { label: '待比赛', value: stageWaitingMatches.length },
      { label: '已完成', value: completed.length },
    ];
  }

  function getStageProgressPercent(stageMatches) {
    if (!stageMatches.length) return 0;
    const completed = stageMatches.filter((match) => match.status === 'completed');
    return Math.round((completed.length / stageMatches.length) * 100);
  }

  function getVenueStore(stage) {
    return stage === 'playoff' ? playoffVenues : leagueVenues;
  }

  function getRecommendationStore(stage) {
    return stage === 'playoff' ? playoffVenueRecommendations : leagueVenueRecommendations;
  }

  function getStageFromMatch(match) {
    return match?.stage === 'playoff' ? 'playoff' : 'league';
  }

  function assignMatchToVenue(match, venue) {
    const now = new Date().toISOString();
    match.status = 'playing';
    match.actualVenueId = venue.id;
    match.venueId = venue.id;
    match.actualOrder = match.actualOrder ?? getNextActualOrder(getStageFromMatch(match));
    match.startedAt = now;
    venue.currentMatchId = match.id;
  }

  function getNextActualOrder(stage) {
    const actualOrders = matches.value
      .filter((match) => getStageFromMatch(match) === stage)
      .map((match) => match.actualOrder)
      .filter((order) => Number.isFinite(order));
    return actualOrders.length ? Math.max(...actualOrders) + 1 : 1;
  }

  function arrangeRecommendedMatch(venue, stage = 'league') {
    const match = getRecommendationStore(stage).value[venue.id];
    if (!match || venue.currentMatchId) return;

    assignMatchToVenue(match, venue);
    clearSkippedMatches(venue.id, stage);
    clearDynamicMatch(venue.id, stage);
  }

  function undoVenueMatch(venue, stage = 'league') {
    const match = getMatchById(venue.currentMatchId);
    if (!match || match.status !== 'playing') return;

    match.status = 'pending';
    match.venueId = null;
    match.actualVenueId = null;
    match.actualOrder = null;
    match.startedAt = null;
    venue.currentMatchId = null;
    rollbackPlayoffBracket(match);
    clearDynamicMatch(venue.id, stage);
  }

  function skipRecommendedMatch(venue, stage = 'league') {
    const match = getRecommendationStore(stage).value[venue.id];
    if (!match || venue.currentMatchId) return;

    const skippedMatchIds = skippedMatchIdsByVenue.value[stage]?.[venue.id] ?? [];
    const nextSkippedMatchIds = [...new Set([...skippedMatchIds, match.id])];
    const shouldCycleSkippedMatches = isAllPlannedCandidatesSkipped(
      stage,
      venue.id,
      nextSkippedMatchIds,
    );
    const nextStageSkipped = { ...(skippedMatchIdsByVenue.value[stage] ?? {}) };

    if (shouldCycleSkippedMatches) {
      delete nextStageSkipped[venue.id];
    } else {
      nextStageSkipped[venue.id] = nextSkippedMatchIds;
    }

    skippedMatchIdsByVenue.value = {
      ...skippedMatchIdsByVenue.value,
      [stage]: nextStageSkipped,
    };
    clearDynamicMatch(venue.id, stage);
  }

  function isAllPlannedCandidatesSkipped(stage, venueId, skippedMatchIds) {
    const stageMatches = stage === 'playoff' ? playoffMatches.value : leagueMatches.value;
    const plannedCandidates = getPlannedVenueCandidates(stageMatches, venueId);

    return (
      plannedCandidates.length > 0 &&
      plannedCandidates.every((item) => skippedMatchIds.includes(item.id))
    );
  }

  function clearSkippedMatches(venueId, stage = 'league') {
    if (!skippedMatchIdsByVenue.value[stage]?.[venueId]) return;

    const nextStageSkipped = { ...skippedMatchIdsByVenue.value[stage] };
    delete nextStageSkipped[venueId];
    skippedMatchIdsByVenue.value = {
      ...skippedMatchIdsByVenue.value,
      [stage]: nextStageSkipped,
    };
  }

  function dynamicallyAllocateVenue(venue, stage = 'league') {
    if (venue.currentMatchId) return;

    const stageMatches = stage === 'playoff' ? playoffMatches.value : leagueMatches.value;
    const stageVenues = getVenueStore(stage).value;
    const skippedMatchIds = skippedMatchIdsByVenue.value[stage]?.[venue.id] ?? [];
    const virtualVenues = stageVenues.map((item) => ({ ...item }));
    const virtualVenue = virtualVenues.find((item) => item.id === venue.id);
    if (virtualVenue) {
      virtualVenue.currentMatchId = null;
    }

    const nextMatch = pickNextMatch(
      stageMatches,
      virtualVenues,
      recentTeamsByStage.value[stage] ?? [],
      skippedMatchIds,
    );
    if (!nextMatch) return;

    dynamicMatchIdsByVenue.value = {
      ...dynamicMatchIdsByVenue.value,
      [stage]: {
        ...(dynamicMatchIdsByVenue.value[stage] ?? {}),
        [venue.id]: nextMatch.id,
      },
    };
  }

  function clearDynamicMatch(venueId, stage = 'league') {
    if (!dynamicMatchIdsByVenue.value[stage]?.[venueId]) return;

    const nextStageDynamic = { ...dynamicMatchIdsByVenue.value[stage] };
    delete nextStageDynamic[venueId];
    dynamicMatchIdsByVenue.value = {
      ...dynamicMatchIdsByVenue.value,
      [stage]: nextStageDynamic,
    };
  }

  function generateSchedule() {
    if (hasLeagueSchedule.value) return;

    leagueTeamNames.value = normalizeTeamNames(leagueTeamCount.value, leagueTeamNames.value);
    leagueVenueNames.value = normalizeVenueNames(leagueVenueCount.value, leagueVenueNames.value);
    matches.value = [
      ...generatePlannedSchedule(leagueTeamNames.value, leagueVenueCount.value),
      ...playoffMatches.value,
    ];
    leagueVenues.value = createVenues(leagueVenueCount.value, leagueVenueNames.value);
    recentTeamsByStage.value = { ...recentTeamsByStage.value, league: [] };
    skippedMatchIdsByVenue.value = { ...skippedMatchIdsByVenue.value, league: {} };
    dynamicMatchIdsByVenue.value = { ...dynamicMatchIdsByVenue.value, league: {} };
  }

  function generatePlayoffFromRanking() {
    if (!isLeagueComplete.value || hasPlayoffSchedule.value) return;

    const qualifiedTeams = rankedLeagueTeams.value
      .slice(0, playoffAdvanceCount.value)
      .map((team) => ({ id: team.id, name: team.name }));
    if (qualifiedTeams.length !== 4) return;

    matches.value = [
      ...leagueMatches.value,
      ...createPlayoffMatches(qualifiedTeams),
    ];
    playoffVenueNames.value = normalizeVenueNames(playoffVenueCount.value, playoffVenueNames.value);
    playoffVenues.value = createVenues(playoffVenueCount.value, playoffVenueNames.value);
    skippedMatchIdsByVenue.value = {
      ...skippedMatchIdsByVenue.value,
      playoff: {},
    };
    dynamicMatchIdsByVenue.value = { ...dynamicMatchIdsByVenue.value, playoff: {} };
  }

  function generateManualPlayoff() {
    if (hasPlayoffSchedule.value) return;

    const names = normalizeTeamNames(4, manualPlayoffNames.value);
    manualPlayoffNames.value = names;
    matches.value = [
      ...leagueMatches.value,
      ...createPlayoffMatches(createTeams(names)),
    ];
    playoffVenueNames.value = normalizeVenueNames(playoffVenueCount.value, playoffVenueNames.value);
    playoffVenues.value = createVenues(playoffVenueCount.value, playoffVenueNames.value);
    recentTeamsByStage.value = { ...recentTeamsByStage.value, playoff: [] };
    skippedMatchIdsByVenue.value = { ...skippedMatchIdsByVenue.value, playoff: {} };
    dynamicMatchIdsByVenue.value = { ...dynamicMatchIdsByVenue.value, playoff: {} };
  }

  function createPlayoffMatches(teams) {
    return generatePlayoffSchedule(teams, playoffVenueCount.value, 1, 1);
  }

  function getNextPlannedOrder() {
    const plannedOrders = leagueMatches.value
      .map((match) => match.plannedOrder ?? match.order)
      .filter((order) => Number.isFinite(order));
    return plannedOrders.length ? Math.max(...plannedOrders) + 1 : 1;
  }

  function getNextPlannedRound() {
    const plannedRounds = leagueMatches.value
      .map((match) => match.plannedRound)
      .filter((round) => Number.isFinite(round));
    return plannedRounds.length ? Math.max(...plannedRounds) + 1 : 1;
  }

  function openScoreModal(venue, stage = 'league') {
    const match = getMatchById(venue.currentMatchId);
    if (!match) return;

    scoringMatchId.value = match.id;
    finishingVenueId.value = venue.id;
    finishingStage.value = stage;
    scoreA.value = match.scoreA ?? 0;
    scoreB.value = match.scoreB ?? 0;
    scoreModalOpen.value = true;
  }

  function openMatchScoreModal(match) {
    if (!match || match.teamA?.placeholder || match.teamB?.placeholder) return;

    scoringMatchId.value = match.id;
    finishingVenueId.value = null;
    finishingStage.value = getStageFromMatch(match);
    scoreA.value = match.scoreA ?? 0;
    scoreB.value = match.scoreB ?? 0;
    scoreModalOpen.value = true;
  }

  function finishMatchWithScore() {
    const match = getMatchById(scoringMatchId.value);
    if (!match) return;
    const stage = getStageFromMatch(match);
    const venue = getVenueStore(stage).value.find((item) => item.currentMatchId === match.id);
    const wasCompleted = match.status === 'completed';

    match.status = 'completed';
    match.endedAt = match.endedAt ?? new Date().toISOString();
    match.scoreA = scoreA.value;
    match.scoreB = scoreB.value;
    if (!wasCompleted) {
      recentTeamsByStage.value = {
        ...recentTeamsByStage.value,
        [stage]: getTeamIds(match),
      };
    }
    if (venue) venue.currentMatchId = null;
    if (!wasCompleted) advancePlayoffBracket(match);
    scoreModalOpen.value = false;
    resetScoringState();
  }

  function closeScoreModal() {
    scoreModalOpen.value = false;
    resetScoringState();
  }

  function resetScoringState() {
    finishingVenueId.value = null;
    finishingStage.value = 'league';
    scoringMatchId.value = null;
  }

  function advancePlayoffBracket(match) {
    if (match.stage !== 'playoff' || !match.playoffRole?.startsWith('semifinal')) return;

    const finalMatch = matches.value.find((item) => item.playoffRole === 'final');
    const thirdPlaceMatch = matches.value.find((item) => item.playoffRole === 'third-place');
    if (!finalMatch || !thirdPlaceMatch) return;

    const winner = getMatchWinner(match);
    const loser = getMatchLoser(match);
    const targetSide = match.playoffRole === 'semifinal-1' ? 'teamA' : 'teamB';

    finalMatch[targetSide] = winner;
    thirdPlaceMatch[targetSide] = loser;
    unlockReadyPlayoffMatch(finalMatch);
    unlockReadyPlayoffMatch(thirdPlaceMatch);
  }

  function rollbackPlayoffBracket(match) {
    if (match.stage !== 'playoff' || !match.playoffRole?.startsWith('semifinal')) return;

    const finalMatch = matches.value.find((item) => item.playoffRole === 'final');
    const thirdPlaceMatch = matches.value.find((item) => item.playoffRole === 'third-place');
    if (!finalMatch || !thirdPlaceMatch) return;

    const targetSide = match.playoffRole === 'semifinal-1' ? 'teamA' : 'teamB';
    finalMatch[targetSide] = createPlayoffPlaceholder(match.playoffRole, 'winner');
    thirdPlaceMatch[targetSide] = createPlayoffPlaceholder(match.playoffRole, 'loser');
    lockIfWaitingForTeams(finalMatch);
    lockIfWaitingForTeams(thirdPlaceMatch);
  }

  function createPlayoffPlaceholder(role, result) {
    const semifinalLabel = role === 'semifinal-1' ? '半决赛 1' : '半决赛 2';
    return {
      id: `placeholder-${semifinalLabel} ${result === 'winner' ? '胜者' : '负者'}`,
      name: `${semifinalLabel} ${result === 'winner' ? '胜者' : '负者'}`,
      placeholder: true,
    };
  }

  function unlockReadyPlayoffMatch(match) {
    if (match.status !== 'locked') return;
    if (match.teamA?.placeholder || match.teamB?.placeholder) return;

    match.status = 'pending';
  }

  function lockIfWaitingForTeams(match) {
    if (match.status === 'completed' || match.status === 'playing') return;
    if (match.teamA?.placeholder || match.teamB?.placeholder) {
      match.status = 'locked';
    }
  }

  function getMatchWinner(match) {
    return match.scoreA > match.scoreB ? match.teamA : match.teamB;
  }

  function getMatchLoser(match) {
    return match.scoreA > match.scoreB ? match.teamB : match.teamA;
  }

  function getPlayoffFinalStandings() {
    const finalMatch = playoffMatches.value.find((match) => match.playoffRole === 'final');
    const thirdPlaceMatch = playoffMatches.value.find((match) => match.playoffRole === 'third-place');
    const standings = [];

    if (finalMatch?.status === 'completed') {
      standings.push({ rank: 1, team: getMatchWinner(finalMatch) });
      standings.push({ rank: 2, team: getMatchLoser(finalMatch) });
    }

    if (thirdPlaceMatch?.status === 'completed') {
      standings.push({ rank: 3, team: getMatchWinner(thirdPlaceMatch) });
      standings.push({ rank: 4, team: getMatchLoser(thirdPlaceMatch) });
    }

    return standings;
  }

  function resetLeagueProgress() {
    matches.value = playoffMatches.value;
    leagueVenues.value = [];
    recentTeamsByStage.value = { ...recentTeamsByStage.value, league: [] };
    skippedMatchIdsByVenue.value = { ...skippedMatchIdsByVenue.value, league: {} };
    dynamicMatchIdsByVenue.value = { ...dynamicMatchIdsByVenue.value, league: {} };
    leagueTeamNames.value = createDefaultTeamNames(leagueTeamCount.value);
    leagueVenueNames.value = createDefaultVenueNames(leagueVenueCount.value);
    restoredFromStorage.value = false;
    if (!matches.value.length) localStorage.removeItem(STORAGE_KEY);
  }

  function resetPlayoffProgress() {
    matches.value = leagueMatches.value;
    playoffVenues.value = [];
    recentTeamsByStage.value = { ...recentTeamsByStage.value, playoff: [] };
    skippedMatchIdsByVenue.value = { ...skippedMatchIdsByVenue.value, playoff: {} };
    dynamicMatchIdsByVenue.value = { ...dynamicMatchIdsByVenue.value, playoff: {} };
    playoffAdvanceCount.value = 4;
    manualPlayoffNames.value = createDefaultTeamNames(4);
    playoffVenueNames.value = createDefaultVenueNames(playoffVenueCount.value);
    restoredFromStorage.value = false;
    if (!matches.value.length) localStorage.removeItem(STORAGE_KEY);
  }

  function saveState() {
    if (!hasSchedule.value) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        leagueTeamCount: leagueTeamCount.value,
        leagueVenueCount: leagueVenueCount.value,
        leagueTeamNames: leagueTeamNames.value,
        leagueVenueNames: leagueVenueNames.value,
        playoffVenueCount: playoffVenueCount.value,
        playoffVenueNames: playoffVenueNames.value,
        matches: matches.value,
        leagueVenues: leagueVenues.value,
        playoffVenues: playoffVenues.value,
        recentTeamsByStage: recentTeamsByStage.value,
        skippedMatchIdsByVenue: skippedMatchIdsByVenue.value,
        dynamicMatchIdsByVenue: dynamicMatchIdsByVenue.value,
        playoffAdvanceCount: playoffAdvanceCount.value,
        manualPlayoffNames: manualPlayoffNames.value,
      }),
    );
  }

  function restoreState() {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) return;

    try {
      const state = JSON.parse(rawState);
      leagueTeamCount.value = state.leagueTeamCount ?? state.teamCount ?? 5;
      leagueVenueCount.value = state.leagueVenueCount ?? state.venueCount ?? 2;
      playoffVenueCount.value = state.playoffVenueCount ?? state.venueCount ?? 2;
      leagueTeamNames.value = Array.isArray(state.leagueTeamNames ?? state.teamNames)
        ? normalizeTeamNames(leagueTeamCount.value, state.leagueTeamNames ?? state.teamNames)
        : createDefaultTeamNames(leagueTeamCount.value);
      leagueVenueNames.value = Array.isArray(state.leagueVenueNames)
        ? normalizeVenueNames(leagueVenueCount.value, state.leagueVenueNames)
        : normalizeVenueNames(leagueVenueCount.value, extractVenueNames(state.leagueVenues ?? state.venues));
      playoffVenueNames.value = Array.isArray(state.playoffVenueNames)
        ? normalizeVenueNames(playoffVenueCount.value, state.playoffVenueNames)
        : normalizeVenueNames(playoffVenueCount.value, extractVenueNames(state.playoffVenues));
      const fallbackVenues = Array.isArray(state.venues) ? state.venues : [];
      matches.value = restoreStoredMatches(state.matches, fallbackVenues);
      leagueVenues.value = normalizeStageVenues(
        Array.isArray(state.leagueVenues)
          ? state.leagueVenues
          : (hasLeagueSchedule.value ? fallbackVenues : createVenues(leagueVenueCount.value, leagueVenueNames.value)),
        'league',
      );
      playoffVenues.value = normalizeStageVenues(
        Array.isArray(state.playoffVenues)
          ? state.playoffVenues
          : (hasPlayoffSchedule.value && !hasLeagueSchedule.value ? fallbackVenues : createVenues(playoffVenueCount.value, playoffVenueNames.value)),
        'playoff',
      );
      recentTeamsByStage.value = state.recentTeamsByStage ?? {
        league: Array.isArray(state.recentTeams) ? state.recentTeams : [],
        playoff: [],
      };
      skippedMatchIdsByVenue.value = normalizeSkippedState(state.skippedMatchIdsByVenue);
      dynamicMatchIdsByVenue.value = normalizeDynamicMatchState(state.dynamicMatchIdsByVenue);
      playoffAdvanceCount.value = state.playoffAdvanceCount ?? 4;
      manualPlayoffNames.value = Array.isArray(state.manualPlayoffNames)
        ? normalizeTeamNames(4, state.manualPlayoffNames)
        : createDefaultTeamNames(4);
      restoredFromStorage.value = matches.value.length > 0;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function restoreStoredMatches(storedMatches, storedVenues) {
    if (!Array.isArray(storedMatches)) return [];

    const canRebuildPlan =
      storedMatches.length > 0 &&
      storedMatches.every((match) => match.status === 'pending') &&
      storedMatches.some((match) => !match.plannedRound);

    if (canRebuildPlan) {
      return generatePlannedSchedule(leagueTeamNames.value, Math.max(1, storedVenues.length || leagueVenueCount.value));
    }

    return normalizeStoredMatches(storedMatches, storedVenues);
  }

  function normalizeStoredMatches(storedMatches, storedVenues) {
    return storedMatches.map((match, index) => {
      const fallbackVenue = storedVenues[index % Math.max(1, storedVenues.length)];
      return {
        ...match,
        stage: match.stage ?? 'league',
        plannedOrder: match.plannedOrder ?? match.order ?? index + 1,
        plannedRound: match.plannedRound ?? Math.ceil(((match.plannedOrder ?? match.order ?? index + 1)) / Math.max(1, storedVenues.length)),
        plannedVenueId: match.plannedVenueId ?? fallbackVenue?.id ?? null,
        actualVenueId: match.actualVenueId ?? match.venueId ?? null,
        actualOrder: match.actualOrder ?? null,
      };
    });
  }

  function normalizeSkippedState(value) {
    if (!value || typeof value !== 'object') {
      return { league: {}, playoff: {} };
    }

    if ('league' in value || 'playoff' in value) {
      return {
        league: value.league ?? {},
        playoff: value.playoff ?? {},
      };
    }

    return {
      league: value,
      playoff: {},
    };
  }

  function normalizeDynamicMatchState(value) {
    return {
      league: value?.league ?? {},
      playoff: value?.playoff ?? {},
    };
  }

  function normalizeStageVenues(stageVenues, stage) {
    const matchIds = new Set(
      (stage === 'playoff' ? playoffMatches.value : leagueMatches.value).map((match) => match.id),
    );
    const sourceVenues = Array.isArray(stageVenues) && stageVenues.length
      ? stageVenues
      : createVenues(
        stage === 'playoff' ? playoffVenueCount.value : leagueVenueCount.value,
        stage === 'playoff' ? playoffVenueNames.value : leagueVenueNames.value,
      );

    return sourceVenues.map((venue) => ({
      ...venue,
      currentMatchId: matchIds.has(venue.currentMatchId) ? venue.currentMatchId : null,
    }));
  }

  function extractVenueNames(value) {
    return Array.isArray(value)
      ? value.map((venue) => venue?.name).filter(Boolean)
      : [];
  }

  watch(
    () => ({
      leagueTeamCount: leagueTeamCount.value,
      leagueVenueCount: leagueVenueCount.value,
      leagueTeamNames: leagueTeamNames.value,
      leagueVenueNames: leagueVenueNames.value,
      playoffVenueCount: playoffVenueCount.value,
      playoffVenueNames: playoffVenueNames.value,
      matches: matches.value,
      leagueVenues: leagueVenues.value,
      playoffVenues: playoffVenues.value,
      recentTeamsByStage: recentTeamsByStage.value,
      skippedMatchIdsByVenue: skippedMatchIdsByVenue.value,
      dynamicMatchIdsByVenue: dynamicMatchIdsByVenue.value,
      playoffAdvanceCount: playoffAdvanceCount.value,
      manualPlayoffNames: manualPlayoffNames.value,
    }),
    saveState,
    { deep: true },
  );

  watch(leagueTeamCount, (count) => {
    if (!hasLeagueSchedule.value) {
      leagueTeamNames.value = normalizeTeamNames(count, leagueTeamNames.value);
    }
  });

  watch(leagueVenueCount, (count) => {
    if (!hasLeagueSchedule.value) {
      leagueVenueNames.value = normalizeVenueNames(count, leagueVenueNames.value);
    }
  });

  watch(playoffVenueCount, (count) => {
    if (!hasPlayoffSchedule.value) {
      playoffVenueNames.value = normalizeVenueNames(count, playoffVenueNames.value);
    }
  });

  onMounted(restoreState);

  return {
    leagueTeamCount,
    leagueVenueCount,
    leagueTeamNames,
    leagueVenueNames,
    playoffVenueCount,
    playoffVenueNames,
    manualPlayoffNames,
    matches,
    leagueVenues,
    playoffVenues,
    restoredFromStorage,
    leagueVenueRecommendations,
    playoffVenueRecommendations,
    scoreModalOpen,
    scoreA,
    scoreB,
    hasSchedule,
    hasLeagueSchedule,
    hasPlayoffSchedule,
    isLeagueComplete,
    leagueMatches,
    playoffMatches,
    leagueWaitingMatches,
    playoffWaitingMatches,
    completedLeagueMatches,
    currentScoringMatch,
    leagueProgressPercent,
    playoffProgressPercent,
    leagueSummary,
    playoffSummary,
    rankedLeagueTeams,
    playoffAdvanceCount,
    playoffFinalStandings,
    arrangeRecommendedMatch,
    undoVenueMatch,
    skipRecommendedMatch,
    generateSchedule,
    generatePlayoffFromRanking,
    generateManualPlayoff,
    dynamicallyAllocateVenue,
    openScoreModal,
    openMatchScoreModal,
    closeScoreModal,
    finishMatchWithScore,
    resetLeagueProgress,
    resetPlayoffProgress,
  };
}
