<script setup>
// 赛程配置面板：管理生成前的队伍数、场地数和队伍名称输入。
import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons-vue';
import SummaryGrid from './SummaryGrid.vue';

const props = defineProps({
  teamCount: { type: Number, required: true },
  venueCount: { type: Number, required: true },
  teamNames: { type: Array, required: true },
  hasSchedule: { type: Boolean, required: true },
  summary: { type: Array, default: () => [] },
  progressPercent: { type: Number, default: 0 },
});

const emit = defineEmits([
  'update:teamCount',
  'update:venueCount',
  'update:teamNames',
  'generate',
  'reset',
]);

function updateTeamName(index, value) {
  // 队名数组由父级持有，这里通过复制后 emit 避免直接修改 props。
  const nextNames = [...props.teamNames];
  nextNames[index] = value;
  emit('update:teamNames', nextNames);
}
</script>

<template>
  <section class="control-band">
    <a-card class="control-card" :bordered="false">
      <a-form layout="inline" class="config-form">
        <a-form-item label="队伍">
          <a-input-number
            :value="teamCount"
            :min="2"
            :max="32"
            :disabled="hasSchedule"
            @update:value="emit('update:teamCount', $event)"
          />
        </a-form-item>
        <a-form-item label="场地">
          <a-input-number
            :value="venueCount"
            :min="1"
            :max="12"
            :disabled="hasSchedule"
            @update:value="emit('update:venueCount', $event)"
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            class="tool-action-button"
            :disabled="hasSchedule"
            @click="emit('generate')"
          >
            <template #icon><PlayCircleOutlined /></template>
            {{ hasSchedule ? '赛程已生成' : '生成赛程' }}
          </a-button>
        </a-form-item>
        <a-form-item v-if="hasSchedule" class="config-summary-item">
          <SummaryGrid :summary="summary" :progress-percent="progressPercent" />
        </a-form-item>
        <a-form-item>
          <a-popconfirm
            title="确定清空积分赛程吗？"
            ok-text="清空"
            cancel-text="取消"
            @confirm="emit('reset')"
          >
            <a-button danger class="tool-action-button">
              <template #icon><DeleteOutlined /></template>
              清空赛程
            </a-button>
          </a-popconfirm>
        </a-form-item>
      </a-form>

      <template v-if="!hasSchedule">
        <a-divider />
        <div class="team-editor">
          <label v-for="(_, index) in teamNames" :key="index" class="team-name-field">
            <span>队伍 {{ index + 1 }}</span>
            <a-input
              :value="teamNames[index]"
              :placeholder="`队伍 ${index + 1}`"
              @update:value="updateTeamName(index, $event)"
            />
          </label>
        </div>
      </template>
    </a-card>
  </section>
</template>
