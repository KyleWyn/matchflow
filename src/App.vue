<script setup>
// 应用组装层：只负责组织页面模块，并把核心调度状态传给各功能组件。
import { ref, watch } from 'vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import ConfigPanel from './components/ConfigPanel.vue';
import MatchTables from './components/MatchTables.vue';
import PlayoffPanel from './components/PlayoffPanel.vue';
import RankingStats from './components/RankingStats.vue';
import ScoreModal from './components/ScoreModal.vue';
import VenueGrid from './components/VenueGrid.vue';
import { useMatchScheduler } from './composables/useMatchScheduler';

const UI_PREFERENCES_KEY = 'matchflow-ui-preferences-v1';
const tableViewValues = ['plan', 'actual'];
const rankingSortValues = ['original', 'diff', 'wins', 'wins-diff', 'wins-diff-head-to-head'];

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

watch(
  () => ({
    activeTab: activeTab.value,
    leagueTableView: leagueTableView.value,
    playoffTableView: playoffTableView.value,
    rankingSort: rankingSort.value,
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

function handleGenerateSchedule() {
  generateSchedule();
  activeTab.value = 'league';
}

function handleGeneratePlayoffFromRanking() {
  generatePlayoffFromRanking();
  activeTab.value = 'playoff';
}

function handleGenerateManualPlayoff() {
  generateManualPlayoff();
  activeTab.value = 'playoff';
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
      </a-layout-header>

      <a-layout-content class="app-content">
        <a-alert
          v-if="restoredFromStorage"
          class="restore-alert"
          message="已从本地恢复上次比赛进度"
          type="success"
          show-icon
          closable
          @close="restoredFromStorage = false"
        />

        <a-tabs v-model:active-key="activeTab" class="stage-tabs">
          <a-tab-pane key="league" tab="积分赛程">
            <ConfigPanel
              v-model:team-count="leagueTeamCount"
              v-model:venue-count="leagueVenueCount"
              v-model:team-names="leagueTeamNames"
              v-model:venue-names="leagueVenueNames"
              :has-schedule="hasLeagueSchedule"
              :summary="leagueSummary"
              :progress-percent="leagueProgressPercent"
              @generate="handleGenerateSchedule"
              @reset="resetLeagueProgress"
            />

            <template v-if="hasLeagueSchedule">
              <VenueGrid
                stage="league"
                :venues="leagueVenues"
                :matches="leagueMatches"
                :recommendations="leagueVenueRecommendations"
                :waiting-count="leagueWaitingMatches.length"
                @open-score="openScoreModal"
                @arrange-recommended="arrangeRecommendedMatch"
                @undo-match="undoVenueMatch"
                @skip-recommended="skipRecommendedMatch"
                @use-dynamic="dynamicallyAllocateVenue"
              />

              <MatchTables
                v-model:table-view="leagueTableView"
                title="单循环总赛程表"
                :matches="leagueMatches"
                :venues="leagueVenues"
              />

              <RankingStats
                v-model:ranking-sort="rankingSort"
                :team-names="leagueTeamNames"
                :matches="leagueMatches"
                :completed-matches="completedLeagueMatches"
                @edit-score="openMatchScoreModal"
              />
            </template>

            <a-empty v-else class="empty-state" description="配置队伍和场地后生成单循环赛程" />
          </a-tab-pane>

          <a-tab-pane key="playoff" tab="排位赛">
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
              :final-standings="playoffFinalStandings"
              :summary="playoffSummary"
              :progress-percent="playoffProgressPercent"
              @generate-from-ranking="handleGeneratePlayoffFromRanking"
              @generate-manual="handleGenerateManualPlayoff"
              @reset="resetPlayoffProgress"
            />

            <template v-if="hasPlayoffSchedule">
              <VenueGrid
                stage="playoff"
                :venues="playoffVenues"
                :matches="playoffMatches"
                :recommendations="playoffVenueRecommendations"
                :waiting-count="playoffWaitingMatches.length"
                @open-score="openScoreModal"
                @arrange-recommended="arrangeRecommendedMatch"
                @undo-match="undoVenueMatch"
                @skip-recommended="skipRecommendedMatch"
                @use-dynamic="dynamicallyAllocateVenue"
              />

              <MatchTables
                v-model:table-view="playoffTableView"
                title="排位赛赛程表"
                :matches="playoffMatches"
                :venues="playoffVenues"
              />
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
    </a-layout>
  </a-config-provider>
</template>
