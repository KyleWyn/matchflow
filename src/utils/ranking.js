import { createTeams } from './schedule';

export function createTeamStats(teamNames, completedMatches) {
  const rows = new Map();

  createTeams(teamNames).forEach((team, index) => {
    rows.set(team.id, {
      id: team.id,
      name: team.name,
      originalIndex: index,
      played: 0,
      wins: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      diff: 0,
    });
  });

  completedMatches.forEach((match) => {
    if (match.scoreA === null || match.scoreB === null) return;

    const teamA = rows.get(match.teamA.id);
    const teamB = rows.get(match.teamB.id);
    if (!teamA || !teamB) return;

    teamA.played += 1;
    teamB.played += 1;
    teamA.scored += match.scoreA;
    teamA.conceded += match.scoreB;
    teamB.scored += match.scoreB;
    teamB.conceded += match.scoreA;

    if (match.scoreA > match.scoreB) {
      teamA.wins += 1;
      teamB.losses += 1;
    } else if (match.scoreA < match.scoreB) {
      teamB.wins += 1;
      teamA.losses += 1;
    }
  });

  return Array.from(rows.values()).map((row) => ({
    ...row,
    diff: row.scored - row.conceded,
  }));
}

export function compareHeadToHead(left, right, matches) {
  const match = matches.find(
    (item) =>
      item.status === 'completed' &&
      item.scoreA !== null &&
      item.scoreB !== null &&
      ((item.teamA.id === left.id && item.teamB.id === right.id) ||
        (item.teamA.id === right.id && item.teamB.id === left.id)),
  );

  if (!match || match.scoreA === match.scoreB) return 0;

  const leftScore = match.teamA.id === left.id ? match.scoreA : match.scoreB;
  const rightScore = match.teamA.id === left.id ? match.scoreB : match.scoreA;

  if (leftScore > rightScore) return -1;
  if (leftScore < rightScore) return 1;
  return 0;
}

export function compareTeamRows(left, right, mode, matches) {
  if (mode === 'original') {
    return left.originalIndex - right.originalIndex;
  }

  if (mode === 'wins') {
    return right.wins - left.wins || left.originalIndex - right.originalIndex;
  }

  if (mode === 'wins-diff') {
    return (
      right.wins - left.wins ||
      right.diff - left.diff ||
      left.originalIndex - right.originalIndex
    );
  }

  if (mode === 'wins-diff-head-to-head') {
    return (
      right.wins - left.wins ||
      right.diff - left.diff ||
      compareHeadToHead(left, right, matches) ||
      left.originalIndex - right.originalIndex
    );
  }

  return right.diff - left.diff || left.originalIndex - right.originalIndex;
}

export function isSameRank(left, right, mode, matches) {
  if (!left || !right) return false;

  if (mode === 'wins') {
    return left.wins === right.wins;
  }

  if (mode === 'wins-diff' || mode === 'wins-diff-head-to-head') {
    return (
      left.wins === right.wins &&
      left.diff === right.diff &&
      (mode !== 'wins-diff-head-to-head' || compareHeadToHead(left, right, matches) === 0)
    );
  }

  if (mode === 'original') {
    return false;
  }

  return left.diff === right.diff;
}

export function sortTeamRows(rows, mode, matches) {
  return [...rows].sort((left, right) => compareTeamRows(left, right, mode, matches));
}

export function withRanks(rows, mode, matches) {
  let currentRank = 0;

  return rows.map((row, index) => {
    if (index === 0 || !isSameRank(rows[index - 1], row, mode, matches)) {
      currentRank = index + 1;
    }

    return { ...row, rank: currentRank };
  });
}

export function getMatrixCell(matches, rowTeamId, columnTeamId) {
  if (rowTeamId === columnTeamId) return { text: '-', tone: 'muted' };

  const match = matches.find(
    (item) =>
      (item.teamA.id === rowTeamId && item.teamB.id === columnTeamId) ||
      (item.teamA.id === columnTeamId && item.teamB.id === rowTeamId),
  );

  if (!match) return { text: '-', tone: 'muted' };
  if (match.status === 'playing') return { text: '进行中', tone: 'active' };
  if (match.status === 'pending') return { text: '未赛', tone: 'pending' };

  const rowScore = match.teamA.id === rowTeamId ? match.scoreA : match.scoreB;
  const columnScore = match.teamA.id === rowTeamId ? match.scoreB : match.scoreA;

  if (rowScore > columnScore) {
    return { text: `${rowScore}:${columnScore}`, tone: 'win' };
  }

  if (rowScore < columnScore) {
    return { text: `${rowScore}:${columnScore}`, tone: 'loss' };
  }
  return { text: `${rowScore}:${columnScore}`, tone: 'muted' };
}
