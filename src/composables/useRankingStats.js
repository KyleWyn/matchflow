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

  const teamStatsRows = computed(() =>
    createTeamStats(teamNames.value, completedMatches.value),
  );

  const matrixTeams = computed(() =>
    withRanks(
      sortTeamRows(teamStatsRows.value, rankingSort.value, matches.value),
      rankingSort.value,
      matches.value,
    ),
  );

  const matrixColumns = computed(() => [
    {
      title: rankingSort.value === "original" ? "序号" : "排名",
      dataIndex: "rank",
      key: "rank",
      fixed: "left",
      width: 90,
    },
    {
      title: "队伍",
      dataIndex: "name",
      key: "name",
      fixed: "left",
      width: 140,
    },
    {
      title: "胜负场",
      dataIndex: "winLoss",
      key: "winLoss",
      width: 90,
    },
    {
      title: "净胜分",
      dataIndex: "diff",
      key: "diff",
      width: 90,
    },

    ...matrixTeams.value.map((team) => ({
      title: team.name,
      dataIndex: team.id,
      key: team.id,
      width: 120,
    })),
    {
      title: "进度",
      dataIndex: "playedProgress",
      key: "playedProgress",
      width: 120,
    },
  ]);

  const matrixRows = computed(() =>
    matrixTeams.value.map((team) => ({
      id: team.id,
      name: team.name,
      rank: team.rank,
      winLoss: `${team.wins}-${team.losses}`,
      played: team.played,
      totalMatches: Math.max(0, teamNames.value.length - 1),
      playedProgress: `${team.played}/${Math.max(0, teamNames.value.length - 1)}`,
      diff: team.diff,
    })),
  );

  function getRankClass(record) {
    if (![1, 2, 3].includes(record.rank)) return "";
    return `rank-row-${record.rank}`;
  }

  function getMatrixCell(rowTeamId, columnTeamId) {
    return getMatrixCellData(matches.value, rowTeamId, columnTeamId);
  }

  return {
    rankingSort,
    matrixColumns,
    matrixRows,
    getRankClass,
    getMatrixCell,
  };
}
