<script setup>
// 排位赛面板：负责从单循环排名生成第二阶段，也支持手动创建 4 队排位赛。
import { computed, ref } from 'vue';
import {
  BranchesOutlined,
  CrownOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlayCircleOutlined,
  StarOutlined,
  TrophyOutlined,
} from '@ant-design/icons-vue';
import PasswordConfirm from './PasswordConfirm.vue';
import SummaryGrid from './SummaryGrid.vue';
import { exportElementAsPng } from '../utils/exportImage';

const props = defineProps({
  hasLeagueSchedule: { type: Boolean, required: true },
  hasPlayoffSchedule: { type: Boolean, required: true },
  isLeagueComplete: { type: Boolean, required: true },
  playoffVenueCount: { type: Number, required: true },
  playoffVenueNames: { type: Array, required: true },
  playoffAdvanceCount: { type: Number, required: true },
  manualPlayoffNames: { type: Array, required: true },
  playoffMatches: { type: Array, required: true },
  rankedLeagueTeams: { type: Array, required: true },
  playoffSource: { type: String, default: null },
  finalStandings: { type: Array, required: true },
  summary: { type: Array, default: () => [] },
  progressPercent: { type: Number, default: 0 },
  showTools: { type: Boolean, default: true },
});

const emit = defineEmits([
  'update:playoffVenueCount',
  'update:playoffVenueNames',
  'update:playoffAdvanceCount',
  'update:manualPlayoffNames',
  'generate-from-ranking',
  'generate-manual',
  'reset',
  'edit-score',
]);

const canGenerateFromRanking = computed(
  () => props.hasLeagueSchedule && props.isLeagueComplete && !props.hasPlayoffSchedule,
);
const playoffExportRef = ref(null);
const basicInfoModalOpen = ref(false);
const draftPlayoffVenueNames = ref([]);
const draftManualPlayoffNames = ref([]);

const qualifiedTeams = computed(() =>
  props.rankedLeagueTeams.slice(0, props.playoffAdvanceCount),
);
const qualifiedSlots = computed(() =>
  Array.from({ length: props.playoffAdvanceCount }, (_, index) => {
    const team = qualifiedTeams.value[index];
    return {
      rank: index + 1,
      name: canGenerateFromRanking.value && team ? team.name : '待定',
      settled: canGenerateFromRanking.value && Boolean(team),
    };
  }),
);
const semifinalMatches = computed(() =>
  props.playoffMatches.filter((match) => match.playoffRole?.startsWith('semifinal')),
);
const finalMatch = computed(() =>
  props.playoffMatches.find((match) => match.playoffRole === 'final') ?? null,
);
const thirdPlaceMatch = computed(() =>
  props.playoffMatches.find((match) => match.playoffRole === 'third-place') ?? null,
);

function updateManualName(index, value) {
  const nextNames = [...props.manualPlayoffNames];
  nextNames[index] = value;
  emit('update:manualPlayoffNames', nextNames);
}

function updatePlayoffVenueName(index, value) {
  const nextNames = [...props.playoffVenueNames];
  nextNames[index] = value;
  emit('update:playoffVenueNames', nextNames);
}

function openBasicInfoModal() {
  draftPlayoffVenueNames.value = [...props.playoffVenueNames];
  draftManualPlayoffNames.value = [...props.manualPlayoffNames];
  basicInfoModalOpen.value = true;
}

function updateDraftPlayoffVenueName(index, value) {
  const nextNames = [...draftPlayoffVenueNames.value];
  nextNames[index] = value;
  draftPlayoffVenueNames.value = nextNames;
}

function updateDraftManualName(index, value) {
  const nextNames = [...draftManualPlayoffNames.value];
  nextNames[index] = value;
  draftManualPlayoffNames.value = nextNames;
}

function saveBasicInfo() {
  emit('update:playoffVenueNames', draftPlayoffVenueNames.value);
  if (props.playoffSource === 'manual') {
    emit('update:manualPlayoffNames', draftManualPlayoffNames.value);
  }
  basicInfoModalOpen.value = false;
}

function getStatusColor(status) {
  if (status === 'completed') return 'green';
  if (status === 'playing') return 'blue';
  if (status === 'locked') return 'default';
  return 'gold';
}

function getStatusText(status) {
  if (status === 'completed') return '已完成';
  if (status === 'playing') return '进行中';
  if (status === 'locked') return '待定';
  return '未开始';
}

function canEditMatchScore(match) {
  if (!['pending', 'playing', 'completed'].includes(match?.status)) return false;
  return !hasCompletedDependentMatch(match);
}

function hasCompletedDependentMatch(match) {
  if (!match?.playoffRole?.startsWith('semifinal')) return false;

  const targetSide = match.playoffRole === 'semifinal-1' ? 'teamA' : 'teamB';
  return [finalMatch.value, thirdPlaceMatch.value].some(
    (item) =>
      item?.status === 'completed' &&
      !item[targetSide]?.placeholder,
  );
}

function getScoreEditTitle(match) {
  if (canEditMatchScore(match)) return '点击编辑比分';
  if (hasCompletedDependentMatch(match)) return '后续比赛已有成绩，不能修改';
  return '';
}

function editMatchScore(match) {
  if (!canEditMatchScore(match)) return;
  emit('edit-score', match);
}

function handleStatusKeydown(event, match) {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  event.preventDefault();
  editMatchScore(match);
}

function getTeamScore(match, side) {
  const score = side === 'A' ? match.scoreA : match.scoreB;
  return Number.isFinite(score) ? score : '-';
}

function isWinningSide(match, side) {
  if (match.status !== 'completed') return false;
  if (!Number.isFinite(match.scoreA) || !Number.isFinite(match.scoreB)) return false;

  return side === 'A' ? match.scoreA > match.scoreB : match.scoreB > match.scoreA;
}

function getWinnerLabel(match) {
  if (match.playoffRole === 'final') return '冠军';
  if (match.playoffRole === 'third-place') return '季军';
  return '晋级';
}

function getPlacement(match, side) {
  if (match.status !== 'completed') return null;
  if (match.playoffRole === 'final') {
    return isWinningSide(match, side)
      ? { rank: 1, label: '冠军', icon: 'crown' }
      : { rank: 2, label: '亚军', icon: 'trophy' };
  }
  if (match.playoffRole === 'third-place' && isWinningSide(match, side)) {
    return { rank: 3, label: '季军', icon: 'star' };
  }
  return null;
}

function exportPlayoffResultImage() {
  exportElementAsPng(playoffExportRef.value, `排位赛结果-${new Date().toISOString().slice(0, 10)}.png`, {
    className: 'playoff-result-export',
    onClone: (clone) => {
      clone.querySelector('.card-head-tools')?.remove();
    },
    extraCss: `
      .playoff-result-export .playoff-band {
        margin: 0;
      }
    `,
  });
}
</script>

<template>
  <section ref="playoffExportRef" class="playoff-band">
    <a-card :bordered="false">
      <template #title>
        <span class="section-title">
          <BranchesOutlined />
          排位赛
        </span>
      </template>
      <template v-if="hasPlayoffSchedule" #extra>
        <div class="card-head-tools">
          <a-button class="tool-action-button" @click="exportPlayoffResultImage">
            <template #icon><DownloadOutlined /></template>
            导出结果
          </a-button>
          <template v-if="showTools">
            <SummaryGrid :summary="summary" :progress-percent="progressPercent" />
            <a-button class="tool-action-button" @click="openBasicInfoModal">
              修改基础信息
            </a-button>
            <PasswordConfirm
              title="清空排位赛"
              description="此操作会清空排位赛程和已录入进度。"
              ok-text="清空排位"
              @confirm="emit('reset')"
            >
              <a-button danger class="tool-action-button">
                <template #icon><DeleteOutlined /></template>
                清空排位
              </a-button>
            </PasswordConfirm>
          </template>
        </div>
      </template>

      <div v-if="!hasPlayoffSchedule" class="playoff-setup">
        <div class="playoff-venue-config">
          <div class="setup-editor-head">
            <div>
              <h3 class="setup-editor-title">场地设置</h3>
              <p>两种生成方式共用这组场地。</p>
            </div>
            <a-form layout="inline" class="playoff-inline-form playoff-venue-count-form">
              <a-form-item label="场地数">
                <a-input-number
                  :value="playoffVenueCount"
                  :min="1"
                  :max="12"
                  class="playoff-number"
                  @update:value="emit('update:playoffVenueCount', $event)"
                />
              </a-form-item>
            </a-form>
          </div>
          <div class="venue-name-editor compact-venue-editor">
            <label v-for="(_, index) in playoffVenueNames" :key="index" class="team-name-field">
              <span>场地 {{ index + 1 }}</span>
              <a-input
                :value="playoffVenueNames[index]"
                placeholder="如：6 或 A馆"
                @update:value="updatePlayoffVenueName(index, $event)"
              />
            </label>
          </div>
        </div>

        <div class="playoff-source">
          <h3>按排名生成</h3>
          <p>积分赛完成后，取前 4 名。</p>
          <a-form layout="inline" class="playoff-inline-form">
            <a-form-item label="晋级名额">
              <a-select
                :value="playoffAdvanceCount"
                :options="[{ label: '前 4 名', value: 4 }]"
                class="playoff-select"
                @update:value="emit('update:playoffAdvanceCount', $event)"
              />
            </a-form-item>
            <a-form-item>
              <a-button
                type="primary"
                class="tool-action-button"
                :disabled="!canGenerateFromRanking"
                @click="emit('generate-from-ranking')"
              >
                <template #icon><PlayCircleOutlined /></template>
                生成排位
              </a-button>
            </a-form-item>
          </a-form>
          <div class="qualified-list">
            <a-tag
              v-for="team in qualifiedSlots"
              :key="team.rank"
              :color="team.settled ? 'processing' : 'default'"
            >
              {{ team.rank }}. {{ team.name }}
            </a-tag>
          </div>
          <a-alert
            v-if="!hasLeagueSchedule"
            class="playoff-hint"
            message="暂无积分赛数据，可手动创建。"
            type="info"
            show-icon
          />
          <a-alert
            v-else-if="!isLeagueComplete"
            class="playoff-hint"
            message="积分赛未完成，暂不能按排名生成。"
            type="info"
            show-icon
          />
        </div>

        <div class="playoff-source">
          <h3>手动创建</h3>
          <p>按 1-4 号种子生成。</p>
          <div class="manual-playoff-editor">
            <label v-for="(_, index) in manualPlayoffNames" :key="index" class="team-name-field">
              <span>{{ index + 1 }} 号种子</span>
              <a-input
                :value="manualPlayoffNames[index]"
                :placeholder="`队伍 ${index + 1}`"
                @update:value="updateManualName(index, $event)"
              />
            </label>
          </div>
          <a-button class="tool-action-button" type="primary" ghost @click="emit('generate-manual')">
            <template #icon><PlayCircleOutlined /></template>
            创建排位
          </a-button>
        </div>
      </div>

      <div v-else class="playoff-board">
        <div class="playoff-bracket">
          <div class="playoff-round">
            <span class="playoff-round-title">半决赛</span>
            <div
              v-for="match in semifinalMatches"
              :key="match.id"
              class="playoff-match-card"
            >
              <div class="playoff-match-head">
                <span>{{ match.bracketLabel }}</span>
                <a-tag
                  :class="['playoff-status-tag', { 'is-score-editable': canEditMatchScore(match) }]"
                  :color="getStatusColor(match.status)"
                  :tabindex="canEditMatchScore(match) ? 0 : undefined"
                  :title="getScoreEditTitle(match)"
                  @click.stop="editMatchScore(match)"
                  @keydown="handleStatusKeydown($event, match)"
                >
                  {{ getStatusText(match.status) }}
                </a-tag>
              </div>
              <div class="playoff-scoreboard">
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(match, 'A') }]">
                  <strong>{{ match.teamA.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(match, 'A') }}</span>
                  <a-tag v-if="isWinningSide(match, 'A')" color="success">
                    {{ getWinnerLabel(match) }}
                  </a-tag>
                </div>
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(match, 'B') }]">
                  <strong>{{ match.teamB.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(match, 'B') }}</span>
                  <a-tag v-if="isWinningSide(match, 'B')" color="success">
                    {{ getWinnerLabel(match) }}
                  </a-tag>
                </div>
              </div>
            </div>
          </div>

          <div class="playoff-round playoff-round-finals">
            <span class="playoff-round-title">排名战</span>
            <div
              v-if="finalMatch"
              :class="[
                'playoff-match-card',
                'playoff-final-card',
              ]"
            >
              <div class="playoff-match-head">
                <span>{{ finalMatch.bracketLabel }}</span>
                <a-tag
                  :class="['playoff-status-tag', { 'is-score-editable': canEditMatchScore(finalMatch) }]"
                  :color="getStatusColor(finalMatch.status)"
                  :tabindex="canEditMatchScore(finalMatch) ? 0 : undefined"
                  :title="getScoreEditTitle(finalMatch)"
                  @click.stop="editMatchScore(finalMatch)"
                  @keydown="handleStatusKeydown($event, finalMatch)"
                >
                  {{ getStatusText(finalMatch.status) }}
                </a-tag>
              </div>
              <div class="playoff-scoreboard">
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(finalMatch, 'A') }]">
                  <strong>{{ finalMatch.teamA.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(finalMatch, 'A') }}</span>
                  <a-tag
                    v-if="getPlacement(finalMatch, 'A')"
                    :class="['placement-tag', `placement-rank-${getPlacement(finalMatch, 'A').rank}`]"
                  >
                    <CrownOutlined v-if="getPlacement(finalMatch, 'A').icon === 'crown'" />
                    <TrophyOutlined v-else />
                    {{ getPlacement(finalMatch, 'A').label }}
                  </a-tag>
                </div>
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(finalMatch, 'B') }]">
                  <strong>{{ finalMatch.teamB.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(finalMatch, 'B') }}</span>
                  <a-tag
                    v-if="getPlacement(finalMatch, 'B')"
                    :class="['placement-tag', `placement-rank-${getPlacement(finalMatch, 'B').rank}`]"
                  >
                    <CrownOutlined v-if="getPlacement(finalMatch, 'B').icon === 'crown'" />
                    <TrophyOutlined v-else />
                    {{ getPlacement(finalMatch, 'B').label }}
                  </a-tag>
                </div>
              </div>
            </div>
            <div
              v-if="thirdPlaceMatch"
              class="playoff-match-card"
            >
              <div class="playoff-match-head">
                <span>{{ thirdPlaceMatch.bracketLabel }}</span>
                <a-tag
                  :class="['playoff-status-tag', { 'is-score-editable': canEditMatchScore(thirdPlaceMatch) }]"
                  :color="getStatusColor(thirdPlaceMatch.status)"
                  :tabindex="canEditMatchScore(thirdPlaceMatch) ? 0 : undefined"
                  :title="getScoreEditTitle(thirdPlaceMatch)"
                  @click.stop="editMatchScore(thirdPlaceMatch)"
                  @keydown="handleStatusKeydown($event, thirdPlaceMatch)"
                >
                  {{ getStatusText(thirdPlaceMatch.status) }}
                </a-tag>
              </div>
              <div class="playoff-scoreboard">
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(thirdPlaceMatch, 'A') }]">
                  <strong>{{ thirdPlaceMatch.teamA.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(thirdPlaceMatch, 'A') }}</span>
                  <a-tag
                    v-if="getPlacement(thirdPlaceMatch, 'A')"
                    :class="['placement-tag', `placement-rank-${getPlacement(thirdPlaceMatch, 'A').rank}`]"
                  >
                    <StarOutlined />
                    {{ getPlacement(thirdPlaceMatch, 'A').label }}
                  </a-tag>
                </div>
                <div :class="['playoff-team-row', { 'is-winner': isWinningSide(thirdPlaceMatch, 'B') }]">
                  <strong>{{ thirdPlaceMatch.teamB.name }}</strong>
                  <span class="playoff-score">{{ getTeamScore(thirdPlaceMatch, 'B') }}</span>
                  <a-tag
                    v-if="getPlacement(thirdPlaceMatch, 'B')"
                    :class="['placement-tag', `placement-rank-${getPlacement(thirdPlaceMatch, 'B').rank}`]"
                  >
                    <StarOutlined />
                    {{ getPlacement(thirdPlaceMatch, 'B').label }}
                  </a-tag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="playoff-standings">
          <h3>
            <TrophyOutlined />
            最终名次
          </h3>
          <template v-if="finalStandings.length">
            <div v-for="item in finalStandings" :key="item.rank" class="playoff-standing-row">
              <span>第 {{ item.rank }} 名</span>
              <strong>{{ item.team.name }}</strong>
            </div>
          </template>
          <a-empty v-else description="完成冠军赛和季军赛后生成最终名次" />
        </div>
      </div>

      <a-modal
        v-model:open="basicInfoModalOpen"
        title="修改基础信息"
        ok-text="保存"
        cancel-text="取消"
        @ok="saveBasicInfo"
      >
        <div :class="['basic-info-modal', { 'has-manual-teams': playoffSource === 'manual' }]">
          <div class="basic-info-section is-venue">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">场地编号</h3>
                <p>仅修改显示名称，不重排赛程。</p>
              </div>
            </div>
            <div class="venue-name-editor compact-venue-editor">
              <label v-for="(_, index) in draftPlayoffVenueNames" :key="index" class="team-name-field">
                <span>场地 {{ index + 1 }}</span>
                <a-input
                  :value="draftPlayoffVenueNames[index]"
                  placeholder="如：6 或 A馆"
                  @update:value="updateDraftPlayoffVenueName(index, $event)"
                />
              </label>
            </div>
          </div>

          <div v-if="playoffSource === 'manual'" class="basic-info-section is-team">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">队伍名称</h3>
                <p>仅修改手动排位队伍名称。</p>
              </div>
            </div>
            <div class="manual-playoff-editor">
              <label v-for="(_, index) in draftManualPlayoffNames" :key="index" class="team-name-field">
                <span>{{ index + 1 }} 号种子</span>
                <a-input
                  :value="draftManualPlayoffNames[index]"
                  :placeholder="`队伍 ${index + 1}`"
                  @update:value="updateDraftManualName(index, $event)"
                />
              </label>
            </div>
          </div>
        </div>
      </a-modal>
    </a-card>
  </section>
</template>
