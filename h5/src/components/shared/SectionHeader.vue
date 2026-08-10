<template>
  <div class="section-header">
    <div>
      <span v-if="eyebrow" class="section-header__eyebrow">{{ eyebrow }}</span>
      <h2>{{ title }}</h2>
    </div>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
}>();
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.section-header__eyebrow {
  display: block;
  color: #2f8f4e;
  font-size: 12px;
  font-weight: 600;
}
.section-header h2 {
  margin: 3px 0;
  color: #1f2d24;
  font-size: 17px;
  line-height: 1.3;
}
</style>
