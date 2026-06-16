<script setup>
// 比赛概览条：用紧凑信息栏展示总量、进行中、待赛、已完成和完成进度。
defineProps({
  summary: { type: Array, required: true },
  progressPercent: { type: Number, required: true },
});

function getShortLabel(label) {
  const labels = {
    总比赛: '总场',
    进行中: '进行',
    待比赛: '待赛',
    已完成: '完成',
  };
  return labels[label] ?? label;
}
</script>

<template>
  <div class="summary-inline">
    <span v-for="item in summary" :key="item.label" class="summary-inline-item">
      <span>{{ getShortLabel(item.label) }}</span>
      <strong>{{ item.value }}</strong>
    </span>
    <span class="summary-inline-progress">
      <span>进度</span>
      <strong>{{ progressPercent }}%</strong>
    </span>
  </div>
</template>
