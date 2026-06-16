<script setup>
// 排名对战表：在组件内部维护排序规则，并展示排名、胜场、净胜分和对战结果。
import { DownloadOutlined, TrophyOutlined } from '@ant-design/icons-vue';
import { rankingSortOptions } from '../constants/tables';
import { useRankingStats } from '../composables/useRankingStats';

const props = defineProps({
  teamNames: { type: Array, required: true },
  matches: { type: Array, required: true },
  completedMatches: { type: Array, required: true },
});

const emit = defineEmits(['edit-score']);

const {
  rankingSort,
  matrixColumns,
  matrixRows,
  getRankClass,
  getMatrixCell,
} = useRankingStats(props);

function shouldShowRankDecorations(rank) {
  return rankingSort.value !== 'original' && [1, 2, 3].includes(rank);
}

function getDisplayRankClass(record) {
  return rankingSort.value === 'original' ? '' : getRankClass(record);
}

function getCellText(record, column) {
  if (['rank', 'name', 'wins', 'diff'].includes(column.key)) {
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

function canEditCell(record, column) {
  if (['rank', 'name', 'wins', 'diff'].includes(column.key)) return false;

  const match = getMatrixMatch(record.id, column.key);
  return ['pending', 'playing', 'completed'].includes(match?.status);
}

function editCellScore(record, column) {
  const match = getMatrixMatch(record.id, column.key);
  if (!match) return;

  emit('edit-score', match);
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

function exportExcel() {
  const headerCells = matrixColumns.value
    .map((column) => `<th>${escapeCell(column.title)}</th>`)
    .join('');
  const bodyRows = matrixRows.value
    .map((row) => {
      const cells = matrixColumns.value
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
  <section class="ranking-band">
    <a-card :bordered="false">
      <template #title>排名对战表</template>
      <template #extra>
        <div class="ranking-tools">
          <a-button size="small" @click="exportExcel">
            <template #icon><DownloadOutlined /></template>
            导出 Excel
          </a-button>
          <a-select
            v-model:value="rankingSort"
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
            <span :class="['rank-badge', `rank-badge-${record.rank}`]">
              <TrophyOutlined v-if="shouldShowRankDecorations(record.rank)" />
              {{ record.rank }}
            </span>
          </template>
          <template v-if="column.key === 'name'">
            <strong>{{ record.name }}</strong>
          </template>
          <template v-else-if="['wins', 'diff'].includes(column.key)">
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
    </a-card>
  </section>
</template>
