<template>
  <section class="wizard-step">
    <header class="wizard-step__header">
      <h2>{{ title }}</h2>
      <p v-if="hint">{{ hint }}</p>
    </header>
    <slot />
    <div class="wizard-step__actions actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  hint?: string;
}>();
</script>

<style scoped>
.wizard-step {
  padding: 16px;
}
.wizard-step__header {
  margin-bottom: 16px;
}
.wizard-step__header h2 {
  margin: 0;
  color: #323233;
  font-size: 20px;
  line-height: 1.3;
  letter-spacing: 0;
}
.wizard-step__header p {
  margin: 6px 0 0;
  color: #969799;
  font-size: 13px;
  line-height: 1.5;
}
.wizard-step__actions {
  margin-top: 24px;
}
</style>
