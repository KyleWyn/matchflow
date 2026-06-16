<script setup>
// 比分录入弹窗：只负责比分输入和确认事件，不直接修改比赛状态。
defineProps({
  open: { type: Boolean, required: true },
  match: { type: Object, default: null },
  scoreA: { type: Number, required: true },
  scoreB: { type: Number, required: true },
});

const emit = defineEmits(['update:open', 'update:scoreA', 'update:scoreB', 'confirm']);

function getModalTitle(match) {
  if (!match) return '录入比分';
  if (match.status === 'completed') return '修改比分';
  if (match.status === 'pending') return '补录比分';
  return '录入比分';
}
</script>

<template>
  <a-modal
    :open="open"
    :title="getModalTitle(match)"
    ok-text="保存比分"
    cancel-text="取消"
    :ok-button-props="{ disabled: scoreA === scoreB }"
    @update:open="emit('update:open', $event)"
    @ok="emit('confirm')"
  >
    <div v-if="match" class="score-modal">
      <div class="score-match-title">
        <span>{{ match.teamA.name }}</span>
        <strong>VS</strong>
        <span>{{ match.teamB.name }}</span>
      </div>

      <div class="score-editor">
        <div class="score-team">
          <strong>{{ match.teamA.name }}</strong>
          <a-input-number
            :value="scoreA"
            :min="0"
            :max="999"
            size="large"
            @update:value="emit('update:scoreA', $event)"
          />
        </div>
        <span class="score-separator">:</span>
        <div class="score-team">
          <strong>{{ match.teamB.name }}</strong>
          <a-input-number
            :value="scoreB"
            :min="0"
            :max="999"
            size="large"
            @update:value="emit('update:scoreB', $event)"
          />
        </div>
      </div>
    </div>
    <a-alert
      v-if="match && scoreA === scoreB"
      class="score-alert"
      message="当前赛制不支持平局，请录入不同比分"
      type="warning"
      show-icon
    />
  </a-modal>
</template>
