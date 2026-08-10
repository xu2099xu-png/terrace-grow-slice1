<template>
  <section class="summary-card">
    <SectionHeader eyebrow="今天" :title="`${today.date} · 周${today.weekday}`" />
    <p>
      <span v-if="today.lunar.status === 'available'">
        农历{{ today.lunar.month }}月{{ today.lunar.day }}
      </span>
      <span v-else>农历暂不可用</span>
      <span v-if="today.solar_term"> · {{ today.solar_term }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import SectionHeader from '../shared/SectionHeader.vue';
import type { SeasonalHomePayload } from '../../api/region-selection';

defineProps<{
  today: SeasonalHomePayload['today'];
}>();
</script>

<style scoped>
.summary-card {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
  box-sizing: border-box;
}
.summary-card p {
  margin: 0;
  color: #646566;
  font-size: 14px;
  line-height: 1.5;
}
</style>
