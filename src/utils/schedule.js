const BYE = '__BYE__';

export function createDefaultTeamNames(count) {
  return Array.from({ length: count }, (_, index) => `队伍 ${index + 1}`);
}

export function createTeams(names) {
  return names.map((name, index) => ({
    id: `team-${index + 1}`,
    name: name?.trim() || `队伍 ${index + 1}`,
  }));
}

export function normalizeTeamNames(count, names = []) {
  return Array.from({ length: count }, (_, index) => names[index] || `队伍 ${index + 1}`);
}

export function generateRoundRobin(names) {
  const teams = createTeams(names);
  const count = teams.length;
  const pool = count % 2 === 0 ? [...teams] : [...teams, { id: BYE, name: '轮空' }];
  const rounds = pool.length - 1;
  const half = pool.length / 2;
  const generated = [];
  let order = 1;
  let rotating = [...pool];

  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < half; index += 1) {
      const home = rotating[index];
      const away = rotating[rotating.length - 1 - index];

      if (home.id !== BYE && away.id !== BYE) {
        generated.push({
          id: `match-${order}`,
          stage: 'league',
          order,
          round,
          teamA: home,
          teamB: away,
          status: 'pending',
          venueId: null,
          startedAt: null,
          endedAt: null,
          scoreA: null,
          scoreB: null,
          actualOrder: null,
        });
        order += 1;
      }
    }

    rotating = [
      rotating[0],
      rotating[rotating.length - 1],
      ...rotating.slice(1, rotating.length - 1),
    ];
  }

  return generated;
}

export function generatePlannedSchedule(names, venueCount) {
  const matches = generateRoundRobin(names);
  const venues = createVenues(venueCount);
  const matchesByRound = matches.reduce((groups, match) => {
    groups[match.round] = groups[match.round] ?? [];
    groups[match.round].push(match);
    return groups;
  }, {});
  const sortedRounds = Object.keys(matchesByRound)
    .map(Number)
    .sort((left, right) => left - right);
  const canUseTraditionalRounds = sortedRounds.every(
    (round) => matchesByRound[round].length <= venueCount,
  );

  if (canUseTraditionalRounds) {
    return createTraditionalPlannedSchedule(sortedRounds, matchesByRound, venues);
  }

  return createCompactPlannedSchedule(matches, venues);
}

function createTraditionalPlannedSchedule(sortedRounds, matchesByRound, venues) {
  const plannedMatches = [];
  let plannedOrder = 1;

  sortedRounds.forEach((round) => {
    matchesByRound[round].forEach((match, venueIndex) => {
      plannedMatches.push(createPlannedMatch(
        match,
        plannedOrder,
        round,
        venues[venueIndex].id,
      ));
      plannedOrder += 1;
    });
  });

  return plannedMatches;
}

function createCompactPlannedSchedule(matches, venues) {
  const unscheduledMatches = [...matches].sort(
    (left, right) => left.round - right.round || left.order - right.order,
  );
  const plannedMatches = [];
  let plannedOrder = 1;
  let plannedRound = 1;

  while (unscheduledMatches.length) {
    const usedTeamIds = new Set();

    for (let venueIndex = 0; venueIndex < venues.length; venueIndex += 1) {
      const nextMatchIndex = unscheduledMatches.findIndex((match) =>
        getTeamIds(match).every((teamId) => !usedTeamIds.has(teamId)),
      );

      if (nextMatchIndex === -1) break;

      const [match] = unscheduledMatches.splice(nextMatchIndex, 1);
      getTeamIds(match).forEach((teamId) => usedTeamIds.add(teamId));
      plannedMatches.push(createPlannedMatch(
        match,
        plannedOrder,
        plannedRound,
        venues[venueIndex].id,
      ));
      plannedOrder += 1;
    }

    plannedRound += 1;
  }

  return plannedMatches;
}

function createPlannedMatch(match, plannedOrder, plannedRound, plannedVenueId) {
  return {
    ...match,
    plannedOrder,
    plannedRound,
    plannedVenueId,
    actualVenueId: null,
    actualOrder: null,
  };
}

export function generatePlayoffSchedule(teams, venueCount, startOrder = 1, startRound = 1) {
  const venues = createVenues(venueCount);
  const baseMatches = [
    {
      id: 'playoff-semifinal-1',
      stage: 'playoff',
      playoffRole: 'semifinal-1',
      bracketLabel: '半决赛 1',
      teamA: teams[0],
      teamB: teams[3],
      status: 'pending',
    },
    {
      id: 'playoff-semifinal-2',
      stage: 'playoff',
      playoffRole: 'semifinal-2',
      bracketLabel: '半决赛 2',
      teamA: teams[1],
      teamB: teams[2],
      status: 'pending',
    },
    {
      id: 'playoff-final',
      stage: 'playoff',
      playoffRole: 'final',
      bracketLabel: '冠军赛',
      teamA: createPlaceholderTeam('半决赛 1 胜者'),
      teamB: createPlaceholderTeam('半决赛 2 胜者'),
      status: 'locked',
    },
    {
      id: 'playoff-third-place',
      stage: 'playoff',
      playoffRole: 'third-place',
      bracketLabel: '季军赛',
      teamA: createPlaceholderTeam('半决赛 1 负者'),
      teamB: createPlaceholderTeam('半决赛 2 负者'),
      status: 'locked',
    },
  ];
  const roundGroups = [baseMatches.slice(0, 2), baseMatches.slice(2)];
  const plannedMatches = [];
  let plannedOrder = startOrder;
  let plannedRound = startRound;

  roundGroups.forEach((group) => {
    for (let index = 0; index < group.length; index += venueCount) {
      group.slice(index, index + venueCount).forEach((match, venueIndex) => {
        plannedMatches.push({
          ...match,
          order: plannedOrder,
          plannedOrder,
          plannedRound,
          plannedVenueId: venues[venueIndex].id,
          actualVenueId: null,
          actualOrder: null,
          venueId: null,
          startedAt: null,
          endedAt: null,
          scoreA: null,
          scoreB: null,
        });
        plannedOrder += 1;
      });

      plannedRound += 1;
    }
  });

  return plannedMatches;
}

export function createVenues(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `venue-${index + 1}`,
    name: `场地 ${index + 1}`,
    currentMatchId: null,
  }));
}

export function getTeamIds(match) {
  return [match.teamA, match.teamB]
    .filter((team) => team && !team.placeholder)
    .map((team) => team.id);
}

export function pickNextMatch(allMatches, activeVenues, lastTeams, skippedMatchIds = []) {
  const activeMatchIds = new Set(
    activeVenues.map((venue) => venue.currentMatchId).filter(Boolean),
  );
  const activeTeamIds = new Set(
    allMatches
      .filter((match) => activeMatchIds.has(match.id))
      .flatMap((match) => getTeamIds(match)),
  );
  const lastTeamSet = new Set(lastTeams);
  const skippedMatchIdSet = new Set(skippedMatchIds);

  return allMatches
    .filter(
      (match) =>
        match.status === 'pending' &&
        isMatchReady(match) &&
        !activeMatchIds.has(match.id) &&
        getTeamIds(match).every((teamId) => !activeTeamIds.has(teamId)),
    )
    .map((match) => {
      const conflicts = getTeamIds(match).filter((teamId) => lastTeamSet.has(teamId)).length;
      const skipped = skippedMatchIdSet.has(match.id);
      return { match, conflicts, skipped };
    })
    .sort(
      (left, right) =>
        Number(left.skipped) - Number(right.skipped) ||
        left.conflicts - right.conflicts ||
        (left.match.plannedOrder ?? left.match.order) - (right.match.plannedOrder ?? right.match.order),
    )
    .at(0)?.match ?? null;
}

export function createPlaceholderTeam(name) {
  return {
    id: `placeholder-${name}`,
    name,
    placeholder: true,
  };
}

export function isMatchReady(match) {
  return Boolean(match?.teamA && match?.teamB && !match.teamA.placeholder && !match.teamB.placeholder);
}
