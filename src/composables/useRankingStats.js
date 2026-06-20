import { computed, unref } from "vue";
import {
  createTeamStats,
  getMatrixCell as getMatrixCellData,
  sortTeamRows,
  withRanks,
} from "../utils/ranking";

export function useRankingStats(source) {
  const rankingSort = computed(() => unref(source.rankingSort) ?? "original");

  const teamNames = computed(() => unref(source.teamNames));
  const matches = computed(() => unref(source.matches));
  const completedMatches = computed(() => unref(source.completedMatches));
  const retiredTeamIds = computed(() => unref(source.retiredTeamIds) ?? []);
  const retiredTeamIdSet = computed(() => new Set(retiredTeamIds.value));
  const activeMatches = computed(() =>
    matches.value.filter((match) => !hasRetiredTeamInMatch(match)),
  );
  const activeCompletedMatches = computed(() =>
    completedMatches.value.filter((match) => !hasRetiredTeamInMatch(match)),
  );
  const activeTeamCount = computed(() =>
    Math.max(0, teamNames.value.length - retiredTeamIdSet.value.size),
  );
  const originalStatsByTeamId = computed(() =>
    createTeamStats(teamNames.value, completedMatches.value).reduce((rows, team) => {
      rows[team.id] = team;
      return rows;
    }, {}),
  );

  const teamStatsRows = computed(() => {
    const rows = createTeamStats(teamNames.value, activeCompletedMatches.value).map((team) => ({
      ...team,
      retired: retiredTeamIdSet.value.has(team.id),
    }));

    const activeRows = rows.filter((team) => !team.retired);
    const retiredRows = rows.filter((team) => team.retired);

    return [
      ...withRanks(
        sortTeamRows(activeRows, rankingSort.value, activeMatches.value),
        rankingSort.value,
        activeMatches.value,
      ),
      ...retiredRows.map((team) => ({ ...team, rank: '退赛' })),
    ];
  });

  const matrixTeams = computed(() => teamStatsRows.value);

  const matrixColumns = computed(() => [
    {
      title: rankingSort.value === "original" ? "序号" : "排名",
      dataIndex: "rank",
      key: "rank",
      fixed: "left",
      align: "center",
      width: 90,
    },
    {
      title: "队伍",
      dataIndex: "name",
      key: "name",
      fixed: "left",
      align: "center",
      width: 140,
    },
    {
      title: "胜负场",
      dataIndex: "winLoss",
      key: "winLoss",
      align: "center",
      width: 90,
    },
    {
      title: "净胜分",
      dataIndex: "diff",
      key: "diff",
      align: "center",
      width: 90,
    },

    ...matrixTeams.value.map((team) => ({
      title: team.name,
      dataIndex: team.id,
      key: team.id,
      align: "center",
      width: 120,
    })),
    {
      title: "进度",
      dataIndex: "playedProgress",
      key: "playedProgress",
      align: "center",
      width: 120,
    },
  ]);

  const matrixRows = computed(() =>
    matrixTeams.value.map((team) => {
      const originalStats = originalStatsByTeamId.value[team.id] ?? team;

      return {
        id: team.id,
        name: team.name,
        rank: team.rank,
        retired: team.retired,
        winLoss: `${originalStats.wins}-${originalStats.losses}`,
        played: team.played,
        totalMatches: team.retired ? 0 : Math.max(0, activeTeamCount.value - 1),
        playedProgress: team.retired
          ? '退赛'
          : `${team.played}/${Math.max(0, activeTeamCount.value - 1)}`,
        diff: originalStats.diff,
      };
    }),
  );

  function getRankClass(record) {
    if (record.retired) return "rank-row-retired";
    if (![1, 2, 3].includes(record.rank)) return "";
    return `rank-row-${record.rank}`;
  }

  function getMatrixCell(rowTeamId, columnTeamId) {
    if (rowTeamId === columnTeamId) return { text: "-", tone: "muted" };

    if (isRetiredTeam(rowTeamId) || isRetiredTeam(columnTeamId)) {
      const match = matches.value.find(
        (item) =>
          (item.teamA.id === rowTeamId && item.teamB.id === columnTeamId) ||
          (item.teamA.id === columnTeamId && item.teamB.id === rowTeamId),
      );

      if (!match) return { text: "-", tone: "retired-pending", retired: true };

      if (
        match.status === "completed" &&
        Number.isFinite(match.scoreA) &&
        Number.isFinite(match.scoreB)
      ) {
        const rowScore = match.teamA.id === rowTeamId ? match.scoreA : match.scoreB;
        const columnScore = match.teamA.id === rowTeamId ? match.scoreB : match.scoreA;
        return {
          text: `${rowScore}:${columnScore}`,
          tone: "retired-played",
          retired: true,
        };
      }

      return { text: "不计", tone: "retired-pending", retired: true };
    }

    return getMatrixCellData(activeMatches.value, rowTeamId, columnTeamId);
  }

  function isRetiredTeam(teamId) {
    return retiredTeamIdSet.value.has(teamId);
  }

  function hasRetiredTeamInMatch(match) {
    return isRetiredTeam(match?.teamA?.id) || isRetiredTeam(match?.teamB?.id);
  }

  return {
    rankingSort,
    activeMatches,
    activeCompletedMatches,
    matrixColumns,
    matrixRows,
    getRankClass,
    getMatrixCell,
    isRetiredTeam,
  };
}
