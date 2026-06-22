<script setup>
// 应用组装层：只负责组织页面模块，并把核心调度状态传给各功能组件。
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import ConfigPanel from './components/ConfigPanel.vue';
import DataPorter from './components/DataPorter.vue';
import MatchTables from './components/MatchTables.vue';
import PasswordConfirm from './components/PasswordConfirm.vue';
import PlayoffControlPanel from './components/PlayoffControlPanel.vue';
import PlayoffPanel from './components/PlayoffPanel.vue';
import RankingStats from './components/RankingStats.vue';
import ScoreModal from './components/ScoreModal.vue';
import VenueGrid from './components/VenueGrid.vue';
import { useMatchScheduler } from './composables/useMatchScheduler';

const UI_PREFERENCES_KEY = 'matchflow-ui-preferences-v1';
const tableViewValues = ['plan', 'actual'];
const rankingSortValues = ['original', 'diff', 'wins', 'wins-diff', 'wins-diff-head-to-head'];
const leagueMobileViewValues = ['overview', 'venue', 'schedule', 'ranking'];
const playoffMobileViewValues = ['overview', 'venue', 'schedule', 'bracket'];

function getStoredUiPreferences() {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY) ?? '{}');
  } catch (error) {
    console.warn('读取界面偏好失败', error);
    return {};
  }
}

function normalizePreference(value, allowedValues, fallback) {
  return allowedValues.includes(value) ? value : fallback;
}

const {
  leagueTeamCount,
  leagueVenueCount,
  leagueTeamNames,
  leagueVenueNames,
  playoffVenueCount,
  playoffVenueNames,
  manualPlayoffNames,
  leagueVenues,
  playoffVenues,
  restoredFromStorage,
  leagueVenueRecommendations,
  playoffVenueRecommendations,
  scoreModalOpen,
  scoreA,
  scoreB,
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
  playoffSource,
  retiredLeagueTeamIds,
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
} = useMatchScheduler();

const storedUiPreferences = getStoredUiPreferences();
const activeTab = ref(normalizePreference(storedUiPreferences.activeTab, ['league', 'playoff'], 'league'));
const leagueTableView = ref(normalizePreference(storedUiPreferences.leagueTableView, tableViewValues, 'plan'));
const playoffTableView = ref(normalizePreference(storedUiPreferences.playoffTableView, tableViewValues, 'plan'));
const rankingSort = ref(normalizePreference(storedUiPreferences.rankingSort, rankingSortValues, 'original'));
const leagueMobileView = ref(normalizePreference(storedUiPreferences.leagueMobileView, leagueMobileViewValues, 'overview'));
const playoffMobileView = ref(normalizePreference(storedUiPreferences.playoffMobileView, playoffMobileViewValues, 'overview'));
const scoreEditConfirmRef = ref(null);
const pendingScoreEditMatch = ref(null);

const leagueMobileViewOptions = [
  { label: '总览', value: 'overview' },
  { label: '场地', value: 'venue' },
  { label: '赛程', value: 'schedule' },
  { label: '排名', value: 'ranking' },
];

const playoffMobileViewOptions = [
  { label: '总览', value: 'overview' },
  { label: '场地', value: 'venue' },
  { label: '赛程', value: 'schedule' },
  { label: '对阵', value: 'bracket' },
];

function handleMobileFixedWheel(event) {
  if (!window.matchMedia('(max-width: 640px)').matches || event.ctrlKey) return;

  const fixedControl = event.target.closest?.(
    '.app-header, .stage-tabs > .ant-tabs-nav, .mobile-stage-switch',
  );
  if (!fixedControl) return;

  event.preventDefault();
  window.scrollBy({
    top: event.deltaY,
    left: event.deltaX,
    behavior: 'auto',
  });
}

watch(
  () => ({
    activeTab: activeTab.value,
    leagueTableView: leagueTableView.value,
    playoffTableView: playoffTableView.value,
    rankingSort: rankingSort.value,
    leagueMobileView: leagueMobileView.value,
    playoffMobileView: playoffMobileView.value,
  }),
  (preferences) => {
    try {
      localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn('保存界面偏好失败', error);
    }
  },
  { deep: true },
);

onMounted(() => {
  document.addEventListener('wheel', handleMobileFixedWheel, { capture: true, passive: false });

  if (!restoredFromStorage.value) return;

  message.success({
    content: '已从本地恢复上次比赛进度',
    duration: 3,
  });
  restoredFromStorage.value = false;
});

onUnmounted(() => {
  document.removeEventListener('wheel', handleMobileFixedWheel, { capture: true });
});

function handleGenerateSchedule() {
  generateSchedule();
  activeTab.value = 'league';
  leagueMobileView.value = 'overview';
}

function handleGeneratePlayoffFromRanking() {
  generatePlayoffFromRanking();
  activeTab.value = 'playoff';
  playoffMobileView.value = 'overview';
}

function handleGenerateManualPlayoff() {
  generateManualPlayoff();
  activeTab.value = 'playoff';
  playoffMobileView.value = 'overview';
}

function handleSkipRecommendedMatch(venue, stage) {
  const skipped = skipRecommendedMatch(venue, stage);
  if (!skipped) {
    message.info('暂无其他可跳过的候选比赛');
  }
}

function handleDynamicAllocateVenue(venue, stage) {
  const allocated = dynamicallyAllocateVenue(venue, stage);
  if (!allocated) {
    message.info('暂无可调配的补位比赛');
  }
}

function handleOpenMatchScoreModal(match) {
  if (match?.status !== 'completed') {
    openMatchScoreModal(match);
    return;
  }

  pendingScoreEditMatch.value = match;
  scoreEditConfirmRef.value?.openModal();
}

function confirmCompletedScoreEdit() {
  if (!pendingScoreEditMatch.value) return;

  openMatchScoreModal(pendingScoreEditMatch.value);
  pendingScoreEditMatch.value = null;
}
</script>

<template>
  <a-config-provider :locale="zhCN">
    <a-layout class="app-shell">
      <a-layout-header class="app-header">
        <div class="brand-block">
          <div class="eyebrow">MatchFlow</div>
          <h1>赛程调度台</h1>
        </div>
        <DataPorter />
      </a-layout-header>

      <a-layout-content class="app-content">
        <a-tabs v-model:active-key="activeTab" class="stage-tabs">
          <a-tab-pane key="league" tab="积分赛程">
            <div v-if="hasLeagueSchedule" class="mobile-stage-switch">
              <div class="mobile-stage-options" role="tablist" aria-label="积分赛程功能导航">
                <button
                  v-for="option in leagueMobileViewOptions"
                  :key="option.value"
                  type="button"
                  :class="['mobile-stage-option', { 'is-active': leagueMobileView === option.value }]"
                  role="tab"
                  :aria-selected="leagueMobileView === option.value"
                  @click="leagueMobileView = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div :class="['mobile-stage-panel', { 'is-active': !hasLeagueSchedule || leagueMobileView === 'overview' }]">
              <ConfigPanel
                v-model:team-count="leagueTeamCount"
                v-model:venue-count="leagueVenueCount"
                v-model:team-names="leagueTeamNames"
                v-model:venue-names="leagueVenueNames"
                v-model:retired-team-ids="retiredLeagueTeamIds"
                :has-schedule="hasLeagueSchedule"
                :summary="leagueSummary"
                :progress-percent="leagueProgressPercent"
                @generate="handleGenerateSchedule"
                @reset="resetLeagueProgress"
              />
            </div>

            <template v-if="hasLeagueSchedule">
              <div :class="['mobile-stage-panel', { 'is-active': leagueMobileView === 'venue' }]">
                <VenueGrid
                  stage="league"
                  :venues="leagueVenues"
                  :matches="leagueMatches"
                  :recommendations="leagueVenueRecommendations"
                  :waiting-count="leagueWaitingMatches.length"
                  @open-score="openScoreModal"
                  @arrange-recommended="arrangeRecommendedMatch"
                  @undo-match="undoVenueMatch"
                  @skip-recommended="handleSkipRecommendedMatch"
                  @use-dynamic="handleDynamicAllocateVenue"
                />
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': leagueMobileView === 'schedule' }]">
                <MatchTables
                  v-model:table-view="leagueTableView"
                  title="单循环总赛程表"
                  :matches="leagueMatches"
                  :venues="leagueVenues"
                  :retired-team-ids="retiredLeagueTeamIds"
                />
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': leagueMobileView === 'ranking' }]">
                <RankingStats
                  v-model:ranking-sort="rankingSort"
                  :retired-team-ids="retiredLeagueTeamIds"
                  :team-names="leagueTeamNames"
                  :matches="leagueMatches"
                  :completed-matches="completedLeagueMatches"
                  @edit-score="handleOpenMatchScoreModal"
                />
              </div>
            </template>

            <a-empty v-else class="empty-state" description="配置队伍和场地后生成单循环赛程" />
          </a-tab-pane>

          <a-tab-pane key="playoff" tab="排位赛">
            <PlayoffPanel
              v-if="!hasPlayoffSchedule"
              v-model:playoff-venue-count="playoffVenueCount"
              v-model:playoff-venue-names="playoffVenueNames"
              v-model:playoff-advance-count="playoffAdvanceCount"
              v-model:manual-playoff-names="manualPlayoffNames"
              :has-league-schedule="hasLeagueSchedule"
              :has-playoff-schedule="hasPlayoffSchedule"
              :is-league-complete="isLeagueComplete"
              :playoff-matches="playoffMatches"
              :ranked-league-teams="rankedLeagueTeams"
              :playoff-source="playoffSource"
              :final-standings="playoffFinalStandings"
              :summary="playoffSummary"
              :progress-percent="playoffProgressPercent"
              @generate-from-ranking="handleGeneratePlayoffFromRanking"
              @generate-manual="handleGenerateManualPlayoff"
              @reset="resetPlayoffProgress"
              @edit-score="handleOpenMatchScoreModal"
            />

            <template v-if="hasPlayoffSchedule">
              <div class="mobile-stage-switch">
                <div class="mobile-stage-options" role="tablist" aria-label="排位赛功能导航">
                  <button
                    v-for="option in playoffMobileViewOptions"
                    :key="option.value"
                    type="button"
                    :class="['mobile-stage-option', { 'is-active': playoffMobileView === option.value }]"
                    role="tab"
                    :aria-selected="playoffMobileView === option.value"
                    @click="playoffMobileView = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': playoffMobileView === 'overview' }]">
                <PlayoffControlPanel
                  v-model:playoff-venue-names="playoffVenueNames"
                  v-model:manual-playoff-names="manualPlayoffNames"
                  :playoff-venue-count="playoffVenueCount"
                  :playoff-source="playoffSource"
                  :summary="playoffSummary"
                  :progress-percent="playoffProgressPercent"
                  @reset="resetPlayoffProgress"
                />
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': playoffMobileView === 'venue' }]">
                <VenueGrid
                  stage="playoff"
                  :venues="playoffVenues"
                  :matches="playoffMatches"
                  :recommendations="playoffVenueRecommendations"
                  :waiting-count="playoffWaitingMatches.length"
                  @open-score="openScoreModal"
                  @arrange-recommended="arrangeRecommendedMatch"
                  @undo-match="undoVenueMatch"
                  @skip-recommended="handleSkipRecommendedMatch"
                  @use-dynamic="handleDynamicAllocateVenue"
                />
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': playoffMobileView === 'schedule' }]">
                <MatchTables
                  v-model:table-view="playoffTableView"
                  title="排位赛赛程表"
                  :matches="playoffMatches"
                  :venues="playoffVenues"
                />
              </div>

              <div :class="['mobile-stage-panel', { 'is-active': playoffMobileView === 'bracket' }]">
                <PlayoffPanel
                  v-model:playoff-venue-count="playoffVenueCount"
                  v-model:playoff-venue-names="playoffVenueNames"
                  v-model:playoff-advance-count="playoffAdvanceCount"
                  v-model:manual-playoff-names="manualPlayoffNames"
                  :has-league-schedule="hasLeagueSchedule"
                  :has-playoff-schedule="hasPlayoffSchedule"
                  :is-league-complete="isLeagueComplete"
                  :playoff-matches="playoffMatches"
                  :ranked-league-teams="rankedLeagueTeams"
                  :playoff-source="playoffSource"
                  :final-standings="playoffFinalStandings"
                  :summary="playoffSummary"
                  :progress-percent="playoffProgressPercent"
                  :show-tools="false"
                  @generate-from-ranking="handleGeneratePlayoffFromRanking"
                  @generate-manual="handleGenerateManualPlayoff"
                  @reset="resetPlayoffProgress"
                  @edit-score="handleOpenMatchScoreModal"
                />
              </div>
            </template>
          </a-tab-pane>
        </a-tabs>
      </a-layout-content>

      <ScoreModal
        :open="scoreModalOpen"
        v-model:score-a="scoreA"
        v-model:score-b="scoreB"
        :match="currentScoringMatch"
        @update:open="($event) => { if (!$event) closeScoreModal(); }"
        @confirm="finishMatchWithScore"
      />

      <PasswordConfirm
        ref="scoreEditConfirmRef"
        title="修改已完成比分"
        description="该操作会覆盖已录入成绩，请输入确认密码。"
        ok-text="确认修改"
        @confirm="confirmCompletedScoreEdit"
      >
        <span />
      </PasswordConfirm>
    </a-layout>
  </a-config-provider>
</template>
