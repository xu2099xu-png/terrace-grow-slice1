<template>
  <section class="summary-card">
    <SectionHeader eyebrow="今天" :title="todayTitle" />
    <p class="calendar-lunar">
      <span v-if="today.lunar.status === 'available'">
        农历{{ today.lunar.month }}月{{ today.lunar.day }}
      </span>
      <span v-else>农历暂不可用</span>
      <span v-if="today.solar_term"> · {{ today.solar_term }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SectionHeader from '../shared/SectionHeader.vue';
import type { SeasonalHomePayload } from '../../api/region-selection';

const props = defineProps<{
  today: SeasonalHomePayload['today'];
}>();

const todayTitle = computed(() =>
  props.today.weekday ? `${props.today.date} · 周${props.today.weekday}` : props.today.date,
);
</script>

<style scoped>
.summary-card {
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
  box-sizing: border-box;
}
.calendar-lunar {
  margin: 0;
  color: #646566;
  font-size: 12px;
  line-height: 1.35;
}
</style>
