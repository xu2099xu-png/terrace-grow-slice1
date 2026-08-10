<template>
  <section class="summary-card">
    <div class="panel-head">
      <SectionHeader eyebrow="区县天气" :title="weatherStatusText" />
      <van-tag :type="weather.status === 'available' ? 'success' : 'warning'" round>
        {{ weatherBadgeText }}
      </van-tag>
    </div>
    <div class="weather-main">
      <strong>{{ mainTemperature }}</strong>
      <span>{{ weather.summary || '天气暂不可用' }}</span>
    </div>
    <div v-if="weatherFacts.length" class="weather-grid">
      <span v-for="fact in weatherFacts" :key="fact">{{ fact }}</span>
    </div>
    <div v-if="weather.warnings.length" class="warning-list">
      <span
        v-for="(warning, warningIndex) in weather.warnings"
        :key="`warning-${warningIndex}-${warning}`"
      >
        {{ warning }}
      </span>
    </div>
    <div class="attribution">
      <a
        v-if="weather.attribution.name && weather.attribution.url"
        :href="weather.attribution.url"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ weather.attribution.name }}
      </a>
      <template v-if="weather.attribution.sources.length">
        <span
          v-for="(source, sourceIndex) in weather.attribution.sources"
          :key="`source-${sourceIndex}-${source}`"
        >
          {{ source }}
        </span>
      </template>
    </div>
    <div v-if="agriMatch.proxy_used" class="proxy-banner">
      使用 {{ agriMatch.proxy_name }} 作为近似农业气候区
      <span v-if="agriMatch.distance_km !== null">，约 {{ agriMatch.distance_km }}km</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SectionHeader from '../shared/SectionHeader.vue';
import type { SeasonalHomePayload } from '../../api/region-selection';

const props = defineProps<{
  weather: SeasonalHomePayload['weather'];
  agriMatch: SeasonalHomePayload['agri_region_match'];
}>();

const weatherStatusText = computed(() => {
  if (props.weather.status === 'available') return '可用';
  if (props.weather.status === 'partial') return '部分可用';
  return '暂不可用';
});
const weatherBadgeText = computed(() => {
  if (props.weather.status === 'unavailable') return '不可用';
  if (props.weather.status === 'partial') return props.weather.cache_hit ? '部分缓存' : '部分';
  return props.weather.cache_hit ? '缓存' : '实时';
});
const mainTemperature = computed(() =>
  props.weather.status === 'unavailable'
    ? '—'
    : formatNumber(props.weather.temperature_current_c, '°C'),
);
const weatherFacts = computed(() => {
  if (props.weather.status === 'unavailable') return [];
  const facts = [
    formatFact('最高', props.weather.temperature_max_c, '°C'),
    formatFact('最低', props.weather.temperature_min_c, '°C'),
    formatFact('降水', props.weather.precipitation_probability_percent, '%'),
    typeof props.weather.wind === 'string' && props.weather.wind ? props.weather.wind : '',
  ];
  return facts.filter(Boolean);
});

function formatNumber(value: number | null, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '—';
}

function formatFact(label: string, value: number | null, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${label} ${value}${suffix}` : '';
}
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
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.weather-main {
  margin-top: 2px;
}
.weather-main strong,
.weather-main span {
  display: block;
}
.weather-main strong {
  color: #1f2d24;
  font-size: 24px;
  line-height: 1.1;
}
.weather-main span {
  margin-top: 3px;
  color: #646566;
  font-size: 12px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.weather-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.weather-grid span {
  border-radius: 8px;
  background: #f4f8f5;
  padding: 5px 6px;
  color: #435146;
  font-size: 11px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.warning-list,
.attribution {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.warning-list span {
  color: #b56b00;
  background: #fff7e6;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
}
.attribution a,
.attribution span {
  color: #6f7f73;
  font-size: 12px;
  line-height: 1.4;
}
.proxy-banner {
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 10px;
  background: #edf7ef;
  color: #2b7042;
  font-size: 12px;
  line-height: 1.45;
}
</style>
