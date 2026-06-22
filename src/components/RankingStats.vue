<script setup>
// 排名对战表：在组件内部维护排序规则，并展示排名、胜负场、进度、净胜分和对战结果。
import { computed, ref } from 'vue';
import { DownloadOutlined, TrophyOutlined } from '@ant-design/icons-vue';
import { rankingSortOptions } from '../constants/tables';
import { useRankingStats } from '../composables/useRankingStats';
import { exportElementAsPng } from '../utils/exportImage';

const props = defineProps({
  teamNames: { type: Array, required: true },
  matches: { type: Array, required: true },
  completedMatches: { type: Array, required: true },
  rankingSort: { type: String, default: 'original' },
  retiredTeamIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['edit-score', 'update:rankingSort']);

const rankingSortModel = computed({
  get: () => props.rankingSort,
  set: (value) => emit('update:rankingSort', value),
});
const rankingExportRef = ref(null);
const teamNamesSource = computed(() => props.teamNames);
const matchesSource = computed(() => props.matches);
const completedMatchesSource = computed(() => props.completedMatches);
const retiredTeamIdsSource = computed(() => props.retiredTeamIds);
const activeMatches = computed(() =>
  props.matches.filter((match) => !hasRetiredTeam(match)),
);
const activeCompletedMatches = computed(() =>
  activeMatches.value.filter((match) => match.status === 'completed'),
);
const isRankingFinalized = computed(
  () => activeMatches.value.length > 0 && activeCompletedMatches.value.length === activeMatches.value.length,
);
const retiredTeamIdSet = computed(() => new Set(props.retiredTeamIds));

const {
  matrixColumns,
  matrixRows,
  getRankClass,
  getMatrixCell,
} = useRankingStats({
  teamNames: teamNamesSource,
  matches: matchesSource,
  completedMatches: completedMatchesSource,
  rankingSort: rankingSortModel,
  retiredTeamIds: retiredTeamIdsSource,
});

const exportColumns = computed(() =>
  matrixColumns.value.filter((column) => column.key !== 'playedProgress'),
);
const staticColumnKeys = ['rank', 'name', 'winLoss', 'playedProgress', 'diff'];
const matchupColumns = computed(() =>
  matrixColumns.value.filter((column) => !staticColumnKeys.includes(column.key)),
);

function shouldShowRankDecorations(rank) {
  return isRankingFinalized.value && rankingSortModel.value !== 'original' && [1, 2, 3].includes(rank);
}

function getDisplayRankClass(record) {
  if (record.retired) return getRankClass(record);
  if (!isRankingFinalized.value || rankingSortModel.value === 'original') return '';
  return getRankClass(record);
}

function getCellText(record, column) {
  if (['rank', 'name', 'winLoss', 'playedProgress', 'diff'].includes(column.key)) {
    return record[column.key];
  }

  return getMatrixCell(record.id, column.key).text;
}

function getMatrixMatch(teamId, opponentId) {
  if (teamId === opponentId) return null;

  return props.matches.find(
    (match) =>
      (match.teamA.id === teamId && match.teamB.id === opponentId) ||
      (match.teamA.id === opponentId && match.teamB.id === teamId),
  ) ?? null;
}

function hasRetiredTeam(match) {
  return (
    retiredTeamIdSet.value.has(match?.teamA?.id) ||
    retiredTeamIdSet.value.has(match?.teamB?.id)
  );
}

function canEditCell(record, column) {
  if (staticColumnKeys.includes(column.key)) return false;
  if (record.retired || retiredTeamIdSet.value.has(column.key)) return false;

  const match = getMatrixMatch(record.id, column.key);
  return ['pending', 'playing', 'completed'].includes(match?.status);
}

function editCellScore(record, column) {
  const match = getMatrixMatch(record.id, column.key);
  if (!match) return;

  emit('edit-score', match);
}

function getPlayedProgressPercent(record) {
  if (!record.totalMatches) return 0;
  return Math.round((record.played / record.totalMatches) * 100);
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatExcelTextCell(value) {
  const text = String(value ?? '');
  const escapedText = escapeCell(text);

  if (/^\d+:\d+$/.test(text)) {
    return `${escapedText}&#8203;`;
  }

  return escapedText;
}

function exportResultImage() {
  exportElementAsPng(rankingExportRef.value, `排名对战表-${new Date().toISOString().slice(0, 10)}.png`, {
    className: 'ranking-result-export',
    onClone: (clone) => {
      clone.querySelector('.ranking-tools')?.remove();
    },
    extraCss: `
      .ranking-result-export .matrix-table th:last-child,
      .ranking-result-export .matrix-table td:last-child,
      .ranking-result-export .matrix-table col:last-child {
        display: none !important;
      }
      .ranking-result-export .ranking-band {
        margin: 0;
      }
      .ranking-result-export .ranking-mobile-list {
        display: none !important;
      }
      .ranking-result-export .ant-table-wrapper {
        display: block !important;
      }
    `,
  });
}

function exportExcel() {
  const headerCells = exportColumns.value
    .map((column) => `<th>${escapeCell(column.title)}</th>`)
    .join('');
  const bodyRows = matrixRows.value
    .map((row) => {
      const cells = exportColumns.value
        .map(
          (column) =>
            `<td class="text-cell" style="mso-number-format:'\\@';">${formatExcelTextCell(getCellText(row, column))}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 6px 10px; text-align: center; }
          th { background: #f2f4f7; }
          .text-cell { mso-number-format: "\\@"; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `排名对战表-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

</script>

<template>
  <section ref="rankingExportRef" class="ranking-band">
    <a-card :bordered="false">
      <template #title>排名对战表</template>
      <template #extra>
        <div class="ranking-tools">
          <a-button size="small" @click="exportExcel">
            <template #icon><DownloadOutlined /></template>
            导出 Excel
          </a-button>
          <a-button size="small" @click="exportResultImage">
            <template #icon><DownloadOutlined /></template>
            导出结果
          </a-button>
          <a-select
            v-model:value="rankingSortModel"
            :options="rankingSortOptions"
            size="small"
            class="matrix-sort"
          />
        </div>
      </template>

      <a-table
        :columns="matrixColumns"
        :data-source="matrixRows"
        :pagination="false"
        row-key="id"
        size="middle"
        class="matrix-table"
        :row-class-name="getDisplayRankClass"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rank'">
            <span :class="['rank-badge', record.retired ? 'rank-badge-retired' : `rank-badge-${record.rank}`]">
              <TrophyOutlined v-if="shouldShowRankDecorations(record.rank)" />
              {{ record.rank }}
            </span>
          </template>
          <template v-if="column.key === 'name'">
            <span :class="['ranking-team-name', { 'is-retired': record.retired }]">
              <strong>{{ record.name }}</strong>
              <span v-if="record.retired" class="ranking-retired-tag">退赛</span>
            </span>
          </template>
          <template v-else-if="column.key === 'playedProgress'">
            <span v-if="record.retired" class="played-progress-retired">不计</span>
            <div
              v-else
              :class="[
                'played-progress-bar',
                { 'is-complete': record.totalMatches > 0 && record.played === record.totalMatches },
              ]"
              :title="`已赛 ${record.playedProgress}`"
            >
              <span
                class="played-progress-fill"
                :style="{ width: `${getPlayedProgressPercent(record)}%` }"
              />
              <span class="played-progress-text">
                <strong>{{ record.played }}</strong>
                <span>/{{ record.totalMatches }}</span>
              </span>
            </div>
          </template>
          <template v-else-if="['winLoss', 'diff'].includes(column.key)">
            {{ record[column.key] }}
          </template>
          <template v-else-if="column.key !== 'rank'">
            <button
              v-if="canEditCell(record, column)"
              type="button"
              :class="[
                'matrix-cell',
                'matrix-cell-action',
                `matrix-cell-${getMatrixCell(record.id, column.key).tone}`,
              ]"
              title="点击编辑比分"
              @click="editCellScore(record, column)"
            >
              {{ getMatrixCell(record.id, column.key).text }}
            </button>
            <span v-else :class="['matrix-cell', `matrix-cell-${getMatrixCell(record.id, column.key).tone}`]">
              {{ getMatrixCell(record.id, column.key).text }}
            </span>
          </template>
        </template>
      </a-table>

      <div class="ranking-mobile-list">
        <article
          v-for="record in matrixRows"
          :key="record.id"
          :class="['ranking-mobile-card', getDisplayRankClass(record)]"
        >
          <div class="ranking-mobile-head">
            <span :class="['rank-badge', record.retired ? 'rank-badge-retired' : `rank-badge-${record.rank}`]">
              <TrophyOutlined v-if="shouldShowRankDecorations(record.rank)" />
              {{ record.rank }}
            </span>
            <span :class="['ranking-team-name', { 'is-retired': record.retired }]">
              <strong>{{ record.name }}</strong>
              <span v-if="record.retired" class="ranking-retired-tag">退赛</span>
            </span>
          </div>

          <div class="ranking-mobile-stats">
            <span>胜负 <strong>{{ record.winLoss }}</strong></span>
            <span>净胜分 <strong>{{ record.diff }}</strong></span>
            <span>
              进度
              <strong>{{ record.retired ? '不计' : record.playedProgress }}</strong>
            </span>
          </div>

          <div class="ranking-mobile-matchups">
            <template v-for="column in matchupColumns" :key="column.key">
              <button
                v-if="canEditCell(record, column)"
                type="button"
                :class="[
                  'ranking-mobile-matchup',
                  'ranking-mobile-matchup-action',
                  `matrix-cell-${getMatrixCell(record.id, column.key).tone}`,
                ]"
                title="点击编辑比分"
                @click="editCellScore(record, column)"
              >
                <span>{{ column.title }}</span>
                <strong>{{ getMatrixCell(record.id, column.key).text }}</strong>
              </button>
              <span
                v-else
                :class="[
                  'ranking-mobile-matchup',
                  `matrix-cell-${getMatrixCell(record.id, column.key).tone}`,
                ]"
              >
                <span>{{ column.title }}</span>
                <strong>{{ getMatrixCell(record.id, column.key).text }}</strong>
              </span>
            </template>
          </div>
        </article>
      </div>

    </a-card>
  </section>
</template>
