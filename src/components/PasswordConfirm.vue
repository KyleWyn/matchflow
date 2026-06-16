<script setup>
// 密码确认弹窗：用于保护清空类操作，避免误点造成进度丢失。
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  okText: { type: String, default: '确认' },
  password: { type: String, default: '789' },
});

const emit = defineEmits(['confirm']);

const open = ref(false);
const inputPassword = ref('');

const canConfirm = computed(() => inputPassword.value === props.password);

function openModal() {
  inputPassword.value = '';
  open.value = true;
}

function closeModal() {
  open.value = false;
  inputPassword.value = '';
}

function confirm() {
  if (!canConfirm.value) return;
  emit('confirm');
  closeModal();
}
</script>

<template>
  <span class="password-confirm-trigger" @click="openModal">
    <slot />
  </span>

  <a-modal
    :open="open"
    :title="title"
    :ok-text="okText"
    cancel-text="取消"
    :ok-button-props="{ danger: true, disabled: !canConfirm }"
    @update:open="($event) => { if (!$event) closeModal(); }"
    @ok="confirm"
  >
    <div class="password-confirm-content">
      <p>{{ description }}</p>
      <a-input-password
        v-model:value="inputPassword"
        placeholder="请输入确认密码"
        autocomplete="off"
        @press-enter="confirm"
      />
      <span>输入 789 后可继续。</span>
    </div>
  </a-modal>
</template>
