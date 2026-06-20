<script setup>
// 本地数据导入导出：用于在不同设备或浏览器之间迁移 MatchFlow 进度。
import { ref } from 'vue';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import PasswordConfirm from './PasswordConfirm.vue';

const STORAGE_KEYS = ['matchflow-state-v1', 'matchflow-ui-preferences-v1'];
const MATCHFLOW_STATE_KEY = 'matchflow-state-v1';
const UI_PREFERENCES_KEY = 'matchflow-ui-preferences-v1';
const matchStatusValues = ['pending', 'playing', 'completed', 'locked'];
const stageValues = ['league', 'playoff'];
const tableViewValues = ['plan', 'actual'];
const rankingSortValues = ['original', 'diff', 'wins', 'wins-diff', 'wins-diff-head-to-head'];
const inputRef = ref(null);
const importConfirmRef = ref(null);
const exportModalOpen = ref(false);
const exportFileName = ref('');
const importModalOpen = ref(false);
const pendingImport = ref(null);

function createExportPayload() {
  return {
    app: 'MatchFlow',
    version: 1,
    exportedAt: new Date().toISOString(),
    storage: Object.fromEntries(
      STORAGE_KEYS.map((key) => {
        const rawValue = localStorage.getItem(key);
        return [key, rawValue ? JSON.parse(rawValue) : null];
      }),
    ),
  };
}

function formatExportName() {
  const timestamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '-')
    .replaceAll(':', '');
  return `MatchFlow数据-${timestamp}`;
}

function normalizeExportName(value) {
  const filename = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+$/, '');

  return filename || formatExportName();
}

function openExportModal() {
  exportFileName.value = formatExportName();
  exportModalOpen.value = true;
}

function closeExportModal() {
  exportModalOpen.value = false;
}

function exportData() {
  try {
    const filename = normalizeExportName(exportFileName.value);
    const blob = new Blob([JSON.stringify(createExportPayload(), null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.toLowerCase().endsWith('.json') ? filename : `${filename}.json`;
    link.click();
    URL.revokeObjectURL(url);
    closeExportModal();
  } catch (error) {
    console.warn('导出数据失败', error);
    message.error('导出失败，请稍后重试');
  }
}

function openFilePicker() {
  inputRef.value?.click();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isOptionalString(value) {
  return value === undefined || typeof value === 'string';
}

function isOptionalStringArray(value) {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isOptionalPositiveInteger(value, min, max) {
  if (value === undefined) return true;
  return Number.isInteger(value) && value >= min && value <= max;
}

function isOptionalOrder(value) {
  return value === undefined || value === null || (Number.isInteger(value) && value > 0);
}

function isOptionalScore(value) {
  return value === undefined || value === null || (Number.isInteger(value) && value >= 0 && value <= 999);
}

function isTeamLike(value) {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    (value.placeholder === undefined || typeof value.placeholder === 'boolean')
  );
}

function isMatchLike(value) {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isTeamLike(value.teamA) &&
    isTeamLike(value.teamB) &&
    matchStatusValues.includes(value.status) &&
    (value.stage === undefined || stageValues.includes(value.stage)) &&
    isOptionalString(value.playoffRole) &&
    isOptionalString(value.bracketLabel) &&
    isOptionalOrder(value.order) &&
    isOptionalOrder(value.plannedOrder) &&
    isOptionalOrder(value.plannedRound) &&
    (value.plannedVenueId === undefined || isNullableString(value.plannedVenueId)) &&
    (value.venueId === undefined || isNullableString(value.venueId)) &&
    (value.actualVenueId === undefined || isNullableString(value.actualVenueId)) &&
    isOptionalOrder(value.actualOrder) &&
    isOptionalScore(value.scoreA) &&
    isOptionalScore(value.scoreB) &&
    (value.startedAt === undefined || isNullableString(value.startedAt)) &&
    (value.endedAt === undefined || isNullableString(value.endedAt))
  );
}

function isVenueLike(value) {
  return (
    isPlainObject(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    isNullableString(value.currentMatchId)
  );
}

function isIdListMap(value) {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;

  return Object.values(value).every((stageValue) => {
    if (!isPlainObject(stageValue)) return false;
    return Object.values(stageValue).every(
      (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
    );
  });
}

function isIdMap(value) {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;

  return Object.values(value).every((stageValue) => {
    if (!isPlainObject(stageValue)) return false;
    return Object.values(stageValue).every((id) => typeof id === 'string');
  });
}

function validateMatchflowState(value) {
  if (!isPlainObject(value)) throw new Error('invalid state');

  const matches = value.matches;
  if (matches !== undefined && (!Array.isArray(matches) || matches.length > 5000 || !matches.every(isMatchLike))) {
    throw new Error('invalid matches');
  }

  const venueLists = [value.venues, value.leagueVenues, value.playoffVenues].filter((item) => item !== undefined);
  if (venueLists.some((items) => !Array.isArray(items) || items.length > 100 || !items.every(isVenueLike))) {
    throw new Error('invalid venues');
  }

  if (
    !isOptionalPositiveInteger(value.teamCount, 2, 32) ||
    !isOptionalPositiveInteger(value.leagueTeamCount, 2, 32) ||
    !isOptionalPositiveInteger(value.venueCount, 1, 12) ||
    !isOptionalPositiveInteger(value.leagueVenueCount, 1, 12) ||
    !isOptionalPositiveInteger(value.playoffVenueCount, 1, 12) ||
    !isOptionalPositiveInteger(value.playoffAdvanceCount, 1, 32) ||
    !isOptionalStringArray(value.teamNames) ||
    !isOptionalStringArray(value.leagueTeamNames) ||
    !isOptionalStringArray(value.leagueVenueNames) ||
    !isOptionalStringArray(value.playoffVenueNames) ||
    !isOptionalStringArray(value.manualPlayoffNames) ||
    !isOptionalStringArray(value.retiredLeagueTeamIds) ||
    !isIdListMap(value.skippedMatchIdsByVenue) ||
    !isIdMap(value.dynamicMatchIdsByVenue)
  ) {
    throw new Error('invalid state fields');
  }
}

function validateUiPreferences(value) {
  if (!isPlainObject(value)) throw new Error('invalid preferences');

  if (
    (value.activeTab !== undefined && !stageValues.includes(value.activeTab)) ||
    (value.leagueTableView !== undefined && !tableViewValues.includes(value.leagueTableView)) ||
    (value.playoffTableView !== undefined && !tableViewValues.includes(value.playoffTableView)) ||
    (value.rankingSort !== undefined && !rankingSortValues.includes(value.rankingSort))
  ) {
    throw new Error('invalid preferences fields');
  }
}

function validateStorageValue(key, value) {
  if (value === null) return;
  if (!isPlainObject(value)) throw new Error('invalid storage value');

  if (key === MATCHFLOW_STATE_KEY) {
    validateMatchflowState(value);
    return;
  }

  if (key === UI_PREFERENCES_KEY) {
    validateUiPreferences(value);
  }
}

function parseImportPayload(payload) {
  if (payload?.app !== 'MatchFlow' || !payload.storage || typeof payload.storage !== 'object') {
    throw new Error('invalid payload');
  }

  return Object.fromEntries(
    STORAGE_KEYS.map((key) => {
      const value = payload.storage[key] ?? null;
      validateStorageValue(key, value);
      return [key, value];
    }),
  );
}

async function handleFileChange(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    pendingImport.value = parseImportPayload(payload);
    importModalOpen.value = true;
  } catch (error) {
    console.warn('导入数据失败', error);
    message.error('文件格式不正确，请选择 MatchFlow 导出的数据文件');
  }
}

function closeImportModal() {
  importModalOpen.value = false;
  pendingImport.value = null;
}

function requestImportPassword() {
  if (!pendingImport.value) return;
  importConfirmRef.value?.openModal();
}

function confirmImport() {
  if (!pendingImport.value) return;

  STORAGE_KEYS.forEach((key) => {
    const value = pendingImport.value[key];
    if (value === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  });
  closeImportModal();
  window.location.reload();
}
</script>

<template>
  <div class="data-porter">
    <a-button ghost class="header-tool-button" @click="openExportModal">
      <template #icon><DownloadOutlined /></template>
      导出数据
    </a-button>
    <a-button ghost class="header-tool-button" @click="openFilePicker">
      <template #icon><UploadOutlined /></template>
      导入数据
    </a-button>
    <input
      ref="inputRef"
      class="data-porter-input"
      type="file"
      accept="application/json,.json"
      @change="handleFileChange"
    />

    <a-modal
      :open="exportModalOpen"
      title="导出数据"
      ok-text="导出"
      cancel-text="取消"
      @update:open="($event) => { if (!$event) closeExportModal(); }"
      @ok="exportData"
    >
      <div class="data-export-form">
        <label for="matchflow-export-name">文件名</label>
        <a-input
          id="matchflow-export-name"
          v-model:value="exportFileName"
          placeholder="请输入导出文件名"
          @press-enter="exportData"
        />
        <span>系统会自动补全 .json 后缀。</span>
      </div>
    </a-modal>

    <a-modal
      :open="importModalOpen"
      title="导入数据"
      ok-text="覆盖导入"
      cancel-text="取消"
      :ok-button-props="{ danger: true }"
      @update:open="($event) => { if (!$event) closeImportModal(); }"
      @ok="requestImportPassword"
    >
      <p class="data-import-warning">导入后会覆盖当前本地比赛进度和界面偏好。</p>
    </a-modal>

    <PasswordConfirm
      ref="importConfirmRef"
      title="确认导入数据"
      description="该操作会覆盖当前本地数据，请输入确认密码。"
      ok-text="确认导入"
      @confirm="confirmImport"
    >
      <span />
    </PasswordConfirm>
  </div>
</template>
