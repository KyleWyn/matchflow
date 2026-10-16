<script setup>
import { computed } from 'vue';

const props = defineProps({
  name: { type: String, default: '' },
});

const hasSeparator = computed(() => props.name.includes('/'));
const displayLines = computed(() => {
  if (!hasSeparator.value) return [props.name];

  const [firstLine, ...remainingParts] = props.name.split('/');
  return [firstLine.trim(), remainingParts.join(' ').trim()];
});
</script>

<template>
  <span :class="['team-name-content', { 'is-split': hasSeparator }]">
    <template v-if="hasSeparator">
      <span
        v-for="(line, index) in displayLines"
        :key="index"
        class="team-name-line"
      >
        {{ line }}
      </span>
    </template>
    <template v-else>{{ name }}</template>
  </span>
</template>
