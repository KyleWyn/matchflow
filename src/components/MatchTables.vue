<script setup>
// 总赛程表：支持计划表和现场表两种视图。
import { computed, ref } from 'vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import { getPairing } from '../utils/format';

const props = defineProps({
  title: { type: String, default: '总赛程表' },
  matches: { type: Array, required: true },
  venues: { type: Array, required: true },
});

const tableView = ref('plan');
const tableViewOptions = [
  { label: '计划表', value: 'plan' },
  { label: '现场表', value: 'actual' },
];

const venuePalette = [
  { bg: '#e6f4ff', border: '#1677ff', text: '#0958d9' },
  { bg: '#e8f7ef', border: '#22a06b', text: '#13523a' },
  { bg: '#fff7df', border: '#d48806', text: '#8a5a00' },
  { bg: '#f4efff', border: '#7c3aed', text: '#5b21b6' },
  { bg: '#fdecec', border: '#d64545', text: '#8c2f2f' },
  { bg: '#eaf7f7', border: '#0f9f9f', text: '#0f6666' },
];

const venueColorMap = computed(() =>
  props.venues.reduce((colors, venue, index) => {
    colors[venue.id] = venuePalette[index % venuePalette.length];
    return colors;
  }, {}),
);

const sortedMatches = computed(() =>
  [...props.matches].sort(
    (left, right) =>
      (left.plannedOrder ?? left.order) - (right.plannedOrder ?? right.order),
  ),
);

const scheduleRows = computed(() => {
  const matchesByRound = sortedMatches.value.reduce((groups, match) => {
    const round = match.plannedRound ?? Math.ceil((match.plannedOrder ?? match.order) / props.venues.length);
    groups[round] = groups[round] ?? [];
    groups[round].push(match);
    return groups;
  }, {});

  return Object.keys(matchesByRound)
    .map(Number)
    .sort((left, right) => left - right)
    .map((round) => ({
      round,
      matchesByVenue: props.venues.reduce((result, venue) => {
        result[venue.id] = matchesByRound[round].find((match) => match.plannedVenueId === venue.id) ?? null;
        return result;
      }, {}),
    }));
});

const actualScheduleRows = computed(() => {
  const rows = [];
  const placedMatchIds = new Set();

  function ensureRow(round) {
    while (rows.length < round) {
      rows.push({
        round: rows.length + 1,
        matchesByVenue: props.venues.reduce((result, venue) => {
          result[venue.id] = null;
          return result;
        }, {}),
      });
    }

    return rows[round - 1];
  }

  props.venues.forEach((venue) => {
    props.matches
      .filter(
        (match) =>
          match.actualVenueId === venue.id &&
          Number.isFinite(match.actualOrder),
      )
      .sort((left, right) => left.actualOrder - right.actualOrder)
      .forEach((match, index) => {
        ensureRow(index + 1).matchesByVenue[venue.id] = match;
        placedMatchIds.add(match.id);
      });
  });

  sortedMatches.value
    .filter((match) => !placedMatchIds.has(match.id))
    .forEach((match) => {
      let round =
        match.plannedRound ??
        Math.ceil((match.plannedOrder ?? match.order) / Math.max(1, props.venues.length));
      const venueId = match.plannedVenueId;
      if (!venueId) return;

      while (ensureRow(round).matchesByVenue[venueId]) {
        round += 1;
      }

      ensureRow(round).matchesByVenue[venueId] = match;
      placedMatchIds.add(match.id);
    });

  return rows;
});

const visibleScheduleRows = computed(() =>
  tableView.value === 'actual' ? actualScheduleRows.value : scheduleRows.value,
);

const actualVenueTimeline = computed(() =>
  props.venues.reduce((timeline, venue) => {
    const venueMatches = props.matches
      .filter(
        (match) =>
          match.actualVenueId === venue.id &&
          Number.isFinite(match.actualOrder),
      )
      .sort((left, right) => left.actualOrder - right.actualOrder);

    timeline[venue.id] = venueMatches.reduce((result, match, index) => {
      const previousMatch = venueMatches[index - 1] ?? null;
      result[match.id] = {
        previousPlannedRound: previousMatch?.plannedRound ?? null,
      };
      return result;
    }, {});

    return timeline;
  }, {}),
);

const scheduleColumns = computed(() => [
  {
    title: '轮次',
    dataIndex: 'round',
    key: 'round',
    fixed: 'left',
    width: 80,
  },
  ...props.venues.map((venue) => ({
    title: '',
    key: venue.id,
    width: 220,
    venue,
  })),
]);

function getVenueName(venueId) {
  return props.venues.find((venue) => venue.id === venueId)?.name ?? '-';
}

function getStatusColor(status) {
  if (status === 'completed') return 'green';
  if (status === 'playing') return 'blue';
  if (status === 'locked') return 'default';
  return 'gold';
}

function getStatusText(match) {
  if (match.status === 'completed') return '已完成';
  if (match.status === 'playing') return '进行中';
  if (match.status === 'locked') return '待定';
  return '未开始';
}

function isVenueChanged(match) {
  return Boolean(match.actualVenueId && match.actualVenueId !== match.plannedVenueId);
}

function getOrderShiftText(match) {
  const plannedRound =
    match.plannedRound ??
    Math.ceil((match.plannedOrder ?? match.order) / Math.max(1, props.venues.length));
  const actualVenueId = match.actualVenueId;
  const timeline = actualVenueTimeline.value[actualVenueId]?.[match.id];
  if (!actualVenueId || !timeline) return '';

  const previousRound = timeline.previousPlannedRound;
  const isSameVenueAdjacent =
    !isVenueChanged(match) && previousRound === plannedRound - 1;
  if (isSameVenueAdjacent) return '';

  if (!previousRound) return '';

  if (match.status === 'completed') return `轮次 ${previousRound} 后完成`;
  if (match.status === 'playing') return `轮次 ${previousRound} 后开始`;
  return `轮次 ${previousRound} 后安排`;
}

function getCellStyle(match) {
  if (tableView.value !== 'plan' || !match || !isVenueChanged(match)) return {};

  const color = venueColorMap.value[match.actualVenueId];
  if (!color) return {};

  return {
    background: color.bg,
    borderLeft: `4px solid ${color.border}`,
  };
}

function getVenueTagStyle(match) {
  const color = venueColorMap.value[match.actualVenueId];
  if (!color) return {};

  return {
    color: color.text,
    borderColor: color.border,
    background: 'rgba(255, 255, 255, 0.72)',
  };
}

function getPlanMatrixRows() {
  return scheduleRows.value.map((row) => {
    const exportRow = { 轮次: row.round };
    props.venues.forEach((venue) => {
      const match = row.matchesByVenue[venue.id];
      exportRow[venue.name] = match ? getPairing(match) : '';
    });
    return exportRow;
  });
}

function getCurrentMatrixRows() {
  return visibleScheduleRows.value.map((row) => {
    const exportRow = { 轮次: row.round };
    props.venues.forEach((venue) => {
      const match = row.matchesByVenue[venue.id];
      if (!match) {
        exportRow[venue.name] = '';
        return;
      }

      const notes = [];
      if (tableView.value === 'plan') {
        if (isVenueChanged(match)) notes.push(`调至 ${getVenueName(match.actualVenueId)}`);
        const orderShift = getOrderShiftText(match);
        if (orderShift) notes.push(orderShift);
      }
      exportRow[venue.name] = [getPairing(match), getStatusText(match), ...notes].join(' / ');
    });
    return exportRow;
  });
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function exportRows(rows, filename) {
  const headers = Object.keys(rows[0] ?? {});
  const headerCells = headers.map((header) => `<th>${escapeCell(header)}</th>`).join('');
  const bodyRows = rows
    .map((row) => {
      const cells = headers.map((header) => `<td>${escapeCell(row[header])}</td>`).join('');
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
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPlan() {
  exportRows(getPlanMatrixRows(), '初始化计划表');
}

function exportCurrent() {
  exportRows(
    getCurrentMatrixRows(),
    tableView.value === 'actual' ? '现场赛程表' : '当前总赛程表',
  );
}
</script>

<template>
  <section class="tables-grid single-table-grid">
    <a-card :bordered="false">
      <template #title>{{ title }}</template>
      <template #extra>
        <div class="table-tools">
          <a-segmented
            v-model:value="tableView"
            :options="tableViewOptions"
            size="small"
          />
          <a-button size="small" @click="exportPlan">
            <template #icon><DownloadOutlined /></template>
            导出计划表
          </a-button>
          <a-button size="small" @click="exportCurrent">
            <template #icon><DownloadOutlined /></template>
            导出当前视图
          </a-button>
        </div>
      </template>

      <a-table
        :columns="scheduleColumns"
        :data-source="visibleScheduleRows"
        :pagination="false"
        row-key="round"
        size="middle"
        class="schedule-matrix-table"
      >
        <template #headerCell="{ column }">
          <template v-if="column.key !== 'round'">
            <span
              class="venue-header-badge"
              :style="{
                color: venueColorMap[column.key]?.text,
                borderColor: venueColorMap[column.key]?.border,
                background: venueColorMap[column.key]?.bg,
              }"
            >
              {{ column.venue.name }}
            </span>
          </template>
        </template>

        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'round'">
            <strong>{{ record.round }}</strong>
          </template>

          <template v-else>
            <div
              v-if="record.matchesByVenue[column.key]"
              class="schedule-cell"
              :style="getCellStyle(record.matchesByVenue[column.key])"
            >
              <strong>{{ getPairing(record.matchesByVenue[column.key]) }}</strong>
              <div class="schedule-cell-meta">
                <a-tag v-if="record.matchesByVenue[column.key].stage === 'playoff'" color="purple">
                  {{ record.matchesByVenue[column.key].bracketLabel }}
                </a-tag>
                <a-tag :color="getStatusColor(record.matchesByVenue[column.key].status)">
                  {{ getStatusText(record.matchesByVenue[column.key]) }}
                </a-tag>
                <a-tag
                  v-if="tableView === 'plan' && isVenueChanged(record.matchesByVenue[column.key])"
                  :style="getVenueTagStyle(record.matchesByVenue[column.key])"
                >
                  调至 {{ getVenueName(record.matchesByVenue[column.key].actualVenueId) }}
                </a-tag>
                <a-tag
                  v-if="tableView === 'plan' && getOrderShiftText(record.matchesByVenue[column.key])"
                  color="purple"
                >
                  {{ getOrderShiftText(record.matchesByVenue[column.key]) }}
                </a-tag>
              </div>
            </div>
            <span v-else class="schedule-empty">-</span>
          </template>
        </template>
      </a-table>
    </a-card>
  </section>
</template>
