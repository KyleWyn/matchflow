<script setup>
// 总赛程表：支持计划表和现场表两种视图。
import { computed, ref } from 'vue';
import { DownloadOutlined } from '@ant-design/icons-vue';
import { formatTime, getPairing } from '../utils/format';

const props = defineProps({
  title: { type: String, default: '总赛程表' },
  matches: { type: Array, required: true },
  venues: { type: Array, required: true },
  tableView: { type: String, default: 'plan' },
});

const emit = defineEmits(['update:tableView']);

const tableViewModel = computed({
  get: () => props.tableView,
  set: (value) => emit('update:tableView', value),
});

const tableViewOptions = [
  { label: '计划表', value: 'plan' },
  { label: '现场表', value: 'actual' },
];
const selectedMatch = ref(null);

const venuePalette = [
  { bg: '#fff7e8', border: '#d48806', text: '#8a5a00' },
  { bg: '#f5f0ff', border: '#7c3aed', text: '#5b21b6' },
  { bg: '#fff0f3', border: '#c2415b', text: '#8f2439' },
  { bg: '#f7f3ed', border: '#9a6a3a', text: '#6b4524' },
  { bg: '#f5f6f8', border: '#64748b', text: '#334155' },
  { bg: '#fff1e8', border: '#c65d21', text: '#8a3b12' },
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
  props.tableView === 'actual' ? actualScheduleRows.value : scheduleRows.value,
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
      result[match.id] = { actualIndex: index + 1 };
      return result;
    }, {});

    return timeline;
  }, {}),
);

const plannedVenueTimeline = computed(() =>
  props.venues.reduce((timeline, venue) => {
    const venueMatches = props.matches
      .filter((match) => match.plannedVenueId === venue.id)
      .sort(
        (left, right) =>
          (left.plannedOrder ?? left.order) - (right.plannedOrder ?? right.order),
      );

    timeline[venue.id] = venueMatches.reduce((result, match, index) => {
      result[match.id] = { plannedIndex: index + 1 };
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

function getStatusRibbonText(match) {
  if (match.status === 'completed') return '已完成';
  if (match.status === 'playing') return '进行中';
  if (match.status === 'locked') return '待定';
  return '';
}

function getStatusRibbonClass(match) {
  if (match.status === 'completed') return 'is-completed';
  if (match.status === 'playing') return 'is-playing';
  if (match.status === 'locked') return 'is-locked';
  return '';
}

function getScoreText(match) {
  if (!Number.isFinite(match?.scoreA) || !Number.isFinite(match?.scoreB)) return '-';
  return `${match.scoreA}:${match.scoreB}`;
}

function isVenueChanged(match) {
  return Boolean(match.actualVenueId && match.actualVenueId !== match.plannedVenueId);
}

function getActualOrderIndex(match) {
  const actualVenueId = match.actualVenueId;
  const timeline = actualVenueTimeline.value[actualVenueId]?.[match.id];
  if (!actualVenueId || !timeline) return '';

  if (!timeline.actualIndex) return '';

  return timeline.actualIndex;
}

function getPlannedOrderIndex(match) {
  const plannedVenueId = match?.plannedVenueId;
  const timeline = plannedVenueId ? plannedVenueTimeline.value[plannedVenueId]?.[match.id] : null;
  return timeline?.plannedIndex ?? null;
}

function isActualOrderChanged(match) {
  const actualIndex = getActualOrderIndex(match);
  const plannedIndex = getPlannedOrderIndex(match);
  return Boolean(actualIndex && plannedIndex && actualIndex !== plannedIndex);
}

function shouldShowActualOrderBadge(match) {
  return Boolean(
    props.tableView === 'plan' &&
      getActualOrderIndex(match) &&
      (isVenueChanged(match) || isActualOrderChanged(match)),
  );
}

function getActualOrderText(match) {
  if (!shouldShowActualOrderBadge(match)) return '';

  const actualIndex = getActualOrderIndex(match);
  return actualIndex ? `现场第 ${actualIndex} 场` : '';
}

function hasCellMeta(match) {
  return Boolean(
    match?.stage === 'playoff' ||
      (tableViewModel.value === 'plan' && isVenueChanged(match)) ||
      shouldShowActualOrderBadge(match),
  );
}

function getActualTimelineIndex(match) {
  const actualVenueId = match?.actualVenueId;
  return actualVenueId ? actualVenueTimeline.value[actualVenueId]?.[match.id]?.actualIndex : null;
}

function getDetailActualOrderText(match) {
  const actualIndex = getActualTimelineIndex(match);
  return actualIndex ? `第 ${actualIndex} 场` : '-';
}

function formatDuration(startedAt, endedAt, status) {
  if (status === 'playing' && startedAt && !endedAt) return '进行中';
  if (!startedAt || !endedAt) return '-';

  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return '-';

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

function openMatchDetail(match) {
  selectedMatch.value = match;
}

function closeMatchDetail() {
  selectedMatch.value = null;
}

function getCellStyle(match) {
  if (props.tableView !== 'plan' || !match || !isVenueChanged(match)) return {};

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

function getActualOrderBadgeStyle(match) {
  const color = venueColorMap.value[match.actualVenueId];
  if (!color) return {};

  return {
    color: color.text,
    borderColor: color.border,
    background: color.bg,
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
      if (props.tableView === 'plan') {
        if (isVenueChanged(match)) notes.push(getVenueName(match.actualVenueId));
        const actualOrder = getActualOrderText(match);
        if (actualOrder) notes.push(actualOrder);
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
    props.tableView === 'actual' ? '现场赛程表' : '当前总赛程表',
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
            v-model:value="tableViewModel"
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
              :class="{
                'has-status-ribbon': getStatusRibbonText(record.matchesByVenue[column.key]),
                'has-cell-meta': hasCellMeta(record.matchesByVenue[column.key]),
              }"
              role="button"
              tabindex="0"
              :style="getCellStyle(record.matchesByVenue[column.key])"
              @click="openMatchDetail(record.matchesByVenue[column.key])"
              @keydown.enter.prevent="openMatchDetail(record.matchesByVenue[column.key])"
              @keydown.space.prevent="openMatchDetail(record.matchesByVenue[column.key])"
            >
              <span
                v-if="getStatusRibbonText(record.matchesByVenue[column.key])"
                class="match-status-ribbon"
                :class="getStatusRibbonClass(record.matchesByVenue[column.key])"
                :title="getStatusRibbonText(record.matchesByVenue[column.key])"
              >
                {{ getStatusRibbonText(record.matchesByVenue[column.key]) }}
              </span>
              <div class="schedule-matchup">
                <strong class="schedule-team-name" :title="record.matchesByVenue[column.key].teamA.name">
                  {{ record.matchesByVenue[column.key].teamA.name }}
                </strong>
                <span class="schedule-vs" aria-label="对阵">VS</span>
                <strong class="schedule-team-name" :title="record.matchesByVenue[column.key].teamB.name">
                  {{ record.matchesByVenue[column.key].teamB.name }}
                </strong>
              </div>
              <div class="schedule-cell-meta">
                <a-tag v-if="record.matchesByVenue[column.key].stage === 'playoff'" color="purple">
                  {{ record.matchesByVenue[column.key].bracketLabel }}
                </a-tag>
                <a-tag
                  v-if="tableViewModel === 'plan' && isVenueChanged(record.matchesByVenue[column.key])"
                  :style="getVenueTagStyle(record.matchesByVenue[column.key])"
                >
                  {{ getVenueName(record.matchesByVenue[column.key].actualVenueId) }}
                </a-tag>
                <span
                  v-if="shouldShowActualOrderBadge(record.matchesByVenue[column.key])"
                  class="actual-order-badge"
                  :style="getActualOrderBadgeStyle(record.matchesByVenue[column.key])"
                  title="现场顺序"
                >
                  {{ getActualOrderIndex(record.matchesByVenue[column.key]) }}
                </span>
              </div>
            </div>
            <span v-else class="schedule-empty">-</span>
          </template>
        </template>
      </a-table>

      <a-modal
        :open="Boolean(selectedMatch)"
        title="比赛详情"
        :footer="null"
        @update:open="($event) => { if (!$event) closeMatchDetail(); }"
      >
        <div v-if="selectedMatch" class="match-detail-modal">
          <div class="match-detail-title">
            <strong>{{ getPairing(selectedMatch) }}</strong>
            <a-tag :color="getStatusColor(selectedMatch.status)">
              {{ getStatusText(selectedMatch) }}
            </a-tag>
            <a-tag v-if="selectedMatch.stage === 'playoff'" color="purple">
              {{ selectedMatch.bracketLabel }}
            </a-tag>
          </div>

          <div class="match-detail-grid">
            <div class="match-detail-item">
              <span>计划场地</span>
              <strong>{{ getVenueName(selectedMatch.plannedVenueId) }}</strong>
            </div>
            <div class="match-detail-item">
              <span>实际场地</span>
              <strong>{{ getVenueName(selectedMatch.actualVenueId) }}</strong>
            </div>
            <div class="match-detail-item">
              <span>现场顺序</span>
              <strong>{{ getDetailActualOrderText(selectedMatch) }}</strong>
            </div>
            <div class="match-detail-item">
              <span>比分</span>
              <strong>{{ getScoreText(selectedMatch) }}</strong>
            </div>
            <div class="match-detail-item">
              <span>开始时间</span>
              <strong>{{ formatTime(selectedMatch.startedAt) }}</strong>
            </div>
            <div class="match-detail-item">
              <span>结束时间</span>
              <strong>{{ formatTime(selectedMatch.endedAt) }}</strong>
            </div>
            <div class="match-detail-item match-detail-item-wide">
              <span>持续时间</span>
              <strong>
                {{ formatDuration(selectedMatch.startedAt, selectedMatch.endedAt, selectedMatch.status) }}
              </strong>
            </div>
          </div>
        </div>
      </a-modal>
    </a-card>
  </section>
</template>
