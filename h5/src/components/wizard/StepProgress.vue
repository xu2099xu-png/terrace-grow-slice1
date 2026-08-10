<template>
  <ol class="step-progress" aria-label="建档进度">
    <li
      v-for="item in items"
      :key="item.index"
      class="step-progress__item"
      :class="{
        'step-progress__item--active': item.index === current,
        'step-progress__item--done': item.index < current,
      }"
    >
      <span class="step-progress__dot">{{ item.index }}</span>
      <span class="step-progress__label">{{ item.label }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
defineProps<{
  current: number;
  items: Array<{ index: number; label: string }>;
}>();
</script>

<style scoped>
.step-progress {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
  padding: 14px 16px 10px;
  list-style: none;
  background: #fff;
  border-bottom: 1px solid #ebedf0;
}
.step-progress__item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: #969799;
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
}
.step-progress__dot {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #f2f3f5;
  color: #646566;
  font-size: 12px;
  font-weight: 700;
}
.step-progress__label {
  width: 100%;
  overflow-wrap: anywhere;
}
.step-progress__item--active {
  color: #1989fa;
}
.step-progress__item--active .step-progress__dot {
  background: #1989fa;
  color: #fff;
}
.step-progress__item--done {
  color: #07c160;
}
.step-progress__item--done .step-progress__dot {
  background: #e8f7ee;
  color: #07c160;
}
</style>
