<script setup>
// 场地状态面板：展示每个场地的当前比赛，并触发结束/重新推荐事件。
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
  UndoOutlined,
} from '@ant-design/icons-vue';
import { formatTime } from '../utils/format';
import { getTeamIds } from '../utils/schedule';

const props = defineProps({
  stage: { type: String, default: 'league' },
  venues: { type: Array, required: true },
  matches: { type: Array, required: true },
  recommendations: { type: Object, required: true },
  waitingCount: { type: Number, required: true },
});

const emit = defineEmits([
  'open-score',
  'arrange-recommended',
  'undo-match',
  'skip-recommended',
  'use-dynamic',
]);

function getMatchById(matchId) {
  // 场地只保存当前 matchId，组件内按 id 找到完整比赛信息用于展示。
  return props.matches.find((match) => match.id === matchId) ?? null;
}

function getRecommendedMatch(venue) {
  return props.recommendations[venue.id] ?? null;
}

function getVenueName(venueId) {
  return props.venues.find((venue) => venue.id === venueId)?.name ?? '-';
}

function hasActiveTeamConflict(match) {
  if (!match) return false;

  const activeTeamIds = new Set(
    props.venues
      .map((venue) => getMatchById(venue.currentMatchId))
      .filter(Boolean)
      .flatMap((item) => getTeamIds(item)),
  );

  return getTeamIds(match).some((teamId) => activeTeamIds.has(teamId));
}

</script>

<template>
  <section class="venue-section">
    <div class="venue-grid">
      <a-card
        v-for="venue in venues"
        :key="venue.id"
        class="venue-card"
        :bordered="false"
      >
      <template #title>
        <span class="venue-title">
          <FieldTimeOutlined />
          {{ venue.name }}
        </span>
      </template>

      <template v-if="getMatchById(venue.currentMatchId)">
        <div class="match-now">
          <div class="venue-state-head">
            <a-tag color="blue">
              <template #icon><ClockCircleOutlined /></template>
              进行中
            </a-tag>
            <a-tag v-if="getMatchById(venue.currentMatchId).stage === 'playoff'" color="purple">
              {{ getMatchById(venue.currentMatchId).bracketLabel }}
            </a-tag>
          </div>
          <div class="venue-matchup">
            <strong class="venue-team-name" :title="getMatchById(venue.currentMatchId).teamA.name">
              {{ getMatchById(venue.currentMatchId).teamA.name }}
            </strong>
            <span class="venue-vs" aria-label="对阵">VS</span>
            <strong class="venue-team-name" :title="getMatchById(venue.currentMatchId).teamB.name">
              {{ getMatchById(venue.currentMatchId).teamB.name }}
            </strong>
          </div>
          <p>开始时间：{{ formatTime(getMatchById(venue.currentMatchId).startedAt) }}</p>
        </div>
        <a-space direction="vertical" class="venue-actions">
          <a-button block type="primary" size="large" @click="emit('open-score', venue, props.stage)">
            <template #icon><CheckCircleOutlined /></template>
            记录比分并结束
          </a-button>
          <a-popconfirm
            title="确定撤回这场比赛安排吗？"
            ok-text="撤回"
            cancel-text="取消"
            @confirm="emit('undo-match', venue, props.stage)"
          >
            <a-button block>
              <template #icon><UndoOutlined /></template>
              撤回安排
            </a-button>
          </a-popconfirm>
        </a-space>
      </template>

      <template v-else>
        <div v-if="getRecommendedMatch(venue)" class="recommend-state">
          <div class="venue-state-head">
            <a-tag color="default">空闲</a-tag>
            <span>推荐下一场</span>
            <a-tag v-if="getRecommendedMatch(venue).stage === 'playoff'" color="purple">
              {{ getRecommendedMatch(venue).bracketLabel }}
            </a-tag>
          </div>
          <div class="venue-matchup">
            <strong class="venue-team-name" :title="getRecommendedMatch(venue).teamA.name">
              {{ getRecommendedMatch(venue).teamA.name }}
            </strong>
            <span class="venue-vs" aria-label="对阵">VS</span>
            <strong class="venue-team-name" :title="getRecommendedMatch(venue).teamB.name">
              {{ getRecommendedMatch(venue).teamB.name }}
            </strong>
          </div>
          <p>计划场地：{{ getVenueName(getRecommendedMatch(venue).plannedVenueId) }}</p>
          <p v-if="hasActiveTeamConflict(getRecommendedMatch(venue))" class="venue-warning">
            对阵队伍仍在其他场地进行中
          </p>
        </div>
        <div v-else class="idle-state">
          <a-tag color="default">空闲</a-tag>
          <p>暂无可安排比赛</p>
        </div>
        <a-space v-if="getRecommendedMatch(venue)" direction="vertical" class="venue-actions">
          <a-button
            block
            type="primary"
            size="large"
            :disabled="hasActiveTeamConflict(getRecommendedMatch(venue))"
            @click="emit('arrange-recommended', venue, props.stage)"
          >
            <template #icon><PlayCircleOutlined /></template>
            安排比赛
          </a-button>
          <a-button block :disabled="!waitingCount" @click="emit('skip-recommended', venue, props.stage)">
            <template #icon><ReloadOutlined /></template>
            跳过一次
          </a-button>
          <a-button block @click="emit('use-dynamic', venue, props.stage)">
            <template #icon><SwapOutlined /></template>
            动态调配场地
          </a-button>
        </a-space>
        <a-button v-else block @click="emit('use-dynamic', venue, props.stage)">
          <template #icon><SwapOutlined /></template>
          动态调配场地
        </a-button>
      </template>
      </a-card>
    </div>
  </section>
</template>
