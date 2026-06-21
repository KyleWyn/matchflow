<script setup>
// 排位赛顶部管理条：生成后展示进度、基础信息修改和清空入口。
import { ref } from 'vue';
import { DeleteOutlined } from '@ant-design/icons-vue';
import PasswordConfirm from './PasswordConfirm.vue';
import SummaryGrid from './SummaryGrid.vue';

const props = defineProps({
  playoffVenueCount: { type: Number, required: true },
  playoffVenueNames: { type: Array, required: true },
  manualPlayoffNames: { type: Array, required: true },
  playoffSource: { type: String, default: null },
  summary: { type: Array, default: () => [] },
  progressPercent: { type: Number, default: 0 },
});

const emit = defineEmits([
  'update:playoffVenueNames',
  'update:manualPlayoffNames',
  'reset',
]);

const basicInfoModalOpen = ref(false);
const draftPlayoffVenueNames = ref([]);
const draftManualPlayoffNames = ref([]);

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
</script>

<template>
  <section class="control-band">
    <a-card class="control-card" :bordered="false">
      <div class="config-generated-row">
        <div class="config-generated-meta">
          <span class="config-meta-pill">
            <span>队伍数</span>
            <strong>4</strong>
          </span>
          <span class="config-meta-pill">
            <span>场地数</span>
            <strong>{{ playoffVenueCount }}</strong>
          </span>
          <SummaryGrid :summary="summary" :progress-percent="progressPercent" />
        </div>
        <div class="config-generated-actions">
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
