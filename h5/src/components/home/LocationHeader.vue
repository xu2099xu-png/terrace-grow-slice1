<template>
  <section class="location-header">
    <div>
      <span class="eyebrow">当前区县</span>
      <h1>{{ displayName }}</h1>
    </div>
    <van-button size="small" round plain type="primary" @click="$emit('change')">更换</van-button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SelectedRegionMetadata, SeasonalHomePayload } from '../../api/region-selection';

const props = defineProps<{
  selectedRegion: SelectedRegionMetadata | null;
  region: SeasonalHomePayload['region'] | null;
}>();

defineEmits<{
  change: [];
}>();

const displayName = computed(() => {
  const region = props.region || props.selectedRegion;
  if (!region) return '请选择区县';
  return `${region.province_name} · ${region.city_name} · ${region.name}`;
});
</script>

<style scoped>
.location-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.eyebrow {
  display: block;
  color: #2f8f4e;
  font-size: 12px;
  font-weight: 600;
}
.location-header h1 {
  margin: 4px 0;
  color: #1f2d24;
  font-size: 22px;
  line-height: 1.25;
}
</style>
