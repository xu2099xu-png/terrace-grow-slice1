<template>
  <section class="location-header">
    <div>
      <span class="eyebrow">{{ statusLabel }}</span>
      <h1>{{ displayName }}</h1>
    </div>
    <van-button size="small" plain type="primary" @click="$emit('change')">切换</van-button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SelectedRegionMetadata, SeasonalHomePayload } from '../../api/region-selection';

const props = defineProps<{
  selectedRegion: SelectedRegionMetadata | null;
  region: SeasonalHomePayload['region'] | null;
  locationStatus?: string;
}>();

defineEmits<{
  change: [];
}>();

const displayName = computed(() => {
  const region = props.region || props.selectedRegion;
  if (!region) return '请选择区县';
  return `${region.province_name} · ${region.city_name} · ${region.name}`;
});

const statusLabel = computed(() => {
  if (props.locationStatus === 'unavailable') return '区县暂不可用';
  if (props.locationStatus === 'ok') return '当前区县';
  return props.selectedRegion ? '已选区县' : '选择区县';
});
</script>

<style scoped>
.location-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  min-height: 44px;
}
.location-header > div {
  min-width: 0;
}
.eyebrow {
  display: block;
  color: #2f8f4e;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}
.location-header h1 {
  margin: 3px 0 0;
  color: #1f2d24;
  font-size: 20px;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.location-header :deep(.van-button) {
  flex: 0 0 auto;
  border-radius: 8px;
  height: 32px;
  padding: 0 12px;
}
</style>
