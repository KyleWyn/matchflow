<script setup>
// 赛程配置面板：管理队伍/场地配置；生成后仍允许修改显示名称。
import { computed, ref } from 'vue';
import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons-vue';
import PasswordConfirm from './PasswordConfirm.vue';
import SummaryGrid from './SummaryGrid.vue';
import { createTeams } from '../utils/schedule';

const props = defineProps({
  teamCount: { type: Number, required: true },
  venueCount: { type: Number, required: true },
  teamNames: { type: Array, required: true },
  venueNames: { type: Array, required: true },
  retiredTeamIds: { type: Array, default: () => [] },
  hasSchedule: { type: Boolean, required: true },
  summary: { type: Array, default: () => [] },
  progressPercent: { type: Number, default: 0 },
});

const emit = defineEmits([
  'update:teamCount',
  'update:venueCount',
  'update:teamNames',
  'update:venueNames',
  'update:retiredTeamIds',
  'generate',
  'reset',
]);

const basicInfoModalOpen = ref(false);
const retireModalOpen = ref(false);
const draftTeamNames = ref([]);
const draftVenueNames = ref([]);
const draftRetiredTeamIds = ref([]);
const retireTeams = computed(() => createTeams(props.teamNames));
const draftRetiredTeamIdSet = computed(() => new Set(draftRetiredTeamIds.value));

function updateTeamName(index, value) {
  // 队名数组由父级持有，这里通过复制后 emit 避免直接修改 props。
  const nextNames = [...props.teamNames];
  nextNames[index] = value;
  emit('update:teamNames', nextNames);
}

function updateVenueName(index, value) {
  const nextNames = [...props.venueNames];
  nextNames[index] = value;
  emit('update:venueNames', nextNames);
}

function openBasicInfoModal() {
  draftTeamNames.value = [...props.teamNames];
  draftVenueNames.value = [...props.venueNames];
  basicInfoModalOpen.value = true;
}

function updateDraftTeamName(index, value) {
  const nextNames = [...draftTeamNames.value];
  nextNames[index] = value;
  draftTeamNames.value = nextNames;
}

function updateDraftVenueName(index, value) {
  const nextNames = [...draftVenueNames.value];
  nextNames[index] = value;
  draftVenueNames.value = nextNames;
}

function saveBasicInfo() {
  emit('update:teamNames', draftTeamNames.value);
  emit('update:venueNames', draftVenueNames.value);
  basicInfoModalOpen.value = false;
}

function openRetireModal() {
  draftRetiredTeamIds.value = [...props.retiredTeamIds];
  retireModalOpen.value = true;
}

function closeRetireModal() {
  retireModalOpen.value = false;
}

function toggleDraftRetiredTeam(teamId, checked) {
  const nextIds = new Set(draftRetiredTeamIds.value);
  if (checked) {
    nextIds.add(teamId);
  } else {
    nextIds.delete(teamId);
  }
  draftRetiredTeamIds.value = [...nextIds];
}

function saveRetiredTeams() {
  emit('update:retiredTeamIds', draftRetiredTeamIds.value);
  closeRetireModal();
}
</script>

<template>
  <section class="control-band">
    <a-card class="control-card" :bordered="false">
      <a-form v-if="!hasSchedule" layout="inline" class="config-form">
        <a-form-item label="队伍数">
          <a-input-number
            :value="teamCount"
            :min="2"
            :max="32"
            @update:value="emit('update:teamCount', $event)"
          />
        </a-form-item>
        <a-form-item label="场地数">
          <a-input-number
            :value="venueCount"
            :min="1"
            :max="12"
            @update:value="emit('update:venueCount', $event)"
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            class="tool-action-button"
            @click="emit('generate')"
          >
            <template #icon><PlayCircleOutlined /></template>
            生成赛程
          </a-button>
        </a-form-item>
      </a-form>

      <div v-else class="config-generated-row">
        <div class="config-generated-meta">
          <span class="config-meta-pill">
            <span>队伍数</span>
            <strong>{{ teamCount }}</strong>
          </span>
          <span class="config-meta-pill">
            <span>场地数</span>
            <strong>{{ venueCount }}</strong>
          </span>
          <SummaryGrid :summary="summary" :progress-percent="progressPercent" />
        </div>
        <div class="config-generated-actions">
          <a-button class="tool-action-button" @click="openBasicInfoModal">
            修改基础信息
          </a-button>
          <a-button class="tool-action-button" @click="openRetireModal">
            退赛管理
          </a-button>
          <PasswordConfirm
            title="清空积分赛程"
            description="此操作会清空积分赛程和已录入进度。"
            ok-text="清空赛程"
            @confirm="emit('reset')"
          >
            <a-button danger class="tool-action-button">
              <template #icon><DeleteOutlined /></template>
              清空赛程
            </a-button>
          </PasswordConfirm>
        </div>
      </div>

      <template v-if="!hasSchedule">
        <a-divider />
        <div class="setup-editor-grid">
          <div class="setup-editor-block team-editor-block">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">队伍名称</h3>
              </div>
            </div>
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
          </div>
          <div class="setup-editor-block venue-editor-block">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">场地编号</h3>
                <p>填数字会显示为“6号场地”。</p>
              </div>
            </div>
            <div class="venue-name-editor">
              <label v-for="(_, index) in venueNames" :key="index" class="team-name-field">
                <span>场地 {{ index + 1 }}</span>
                <a-input
                  :value="venueNames[index]"
                  placeholder="如：6 或 A馆"
                  @update:value="updateVenueName(index, $event)"
                />
              </label>
            </div>
          </div>
        </div>
      </template>

      <a-modal
        v-model:open="basicInfoModalOpen"
        title="修改基础信息"
        ok-text="保存"
        cancel-text="取消"
        @ok="saveBasicInfo"
      >
        <div class="basic-info-modal">
          <div class="basic-info-section is-team">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">队伍名称</h3>
                <p>仅修改显示名称，不重排赛程。</p>
              </div>
            </div>
            <div class="team-editor">
              <label v-for="(_, index) in draftTeamNames" :key="index" class="team-name-field">
                <span>队伍 {{ index + 1 }}</span>
                <a-input
                  :value="draftTeamNames[index]"
                  :placeholder="`队伍 ${index + 1}`"
                  @update:value="updateDraftTeamName(index, $event)"
                />
              </label>
            </div>
          </div>
          <div class="basic-info-section is-venue">
            <div class="setup-editor-head">
              <div>
                <h3 class="setup-editor-title">场地编号</h3>
                <p>填数字会显示为“6号场地”。</p>
              </div>
            </div>
            <div class="venue-name-editor">
              <label v-for="(_, index) in draftVenueNames" :key="index" class="team-name-field">
                <span>场地 {{ index + 1 }}</span>
                <a-input
                  :value="draftVenueNames[index]"
                  placeholder="如：6 或 A馆"
                  @update:value="updateDraftVenueName(index, $event)"
                />
              </label>
            </div>
          </div>
        </div>
      </a-modal>

      <a-modal
        :open="retireModalOpen"
        title="退赛管理"
        ok-text="保存"
        cancel-text="取消"
        @ok="saveRetiredTeams"
        @cancel="closeRetireModal"
        @update:open="($event) => { if (!$event) closeRetireModal(); }"
      >
        <div class="retire-manager">
          <p>退赛队伍的循环赛成绩会保留，但不计入排名。</p>
          <div class="retire-team-list">
            <label
              v-for="team in retireTeams"
              :key="team.id"
              :class="['retire-team-item', { 'is-retired': draftRetiredTeamIdSet.has(team.id) }]"
            >
              <span>{{ team.name }}</span>
              <a-switch
                :checked="draftRetiredTeamIdSet.has(team.id)"
                checked-children="退赛"
                un-checked-children="正常"
                @change="(checked) => toggleDraftRetiredTeam(team.id, checked)"
              />
            </label>
          </div>
        </div>
      </a-modal>
    </a-card>
  </section>
</template>
