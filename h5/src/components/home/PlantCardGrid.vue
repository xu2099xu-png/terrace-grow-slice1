<template>
  <div class="plant-card-grid">
    <button
      v-for="item in items"
      :key="item.crop_id"
      type="button"
      class="plant-card"
      data-testid="seasonal-item"
      @click="$emit('select', item)"
      @keydown.enter.prevent="$emit('select', item)"
      @keydown.space.prevent="$emit('select', item)"
    >
      <span class="plant-card__media" aria-hidden="true">
        <img v-if="coverImage(item)" :src="coverImage(item)" alt="" />
        <van-icon v-else name="flower-o" />
      </span>
      <span class="plant-card__body">
        <strong>{{ item.crop_name }}</strong>
        <small v-if="startMethodText(item.available_start_methods || [])">
          {{ startMethodText(item.available_start_methods || []) }}
        </small>
        <small v-if="harvestText(cropById[item.crop_id])">{{ harvestText(cropById[item.crop_id]) }}</small>
      </span>
      <van-tag v-if="item.season_status" :type="item.season_status === 'in_window' ? 'success' : 'default'" round>
        {{ seasonLabel(item.season_status) }}
      </van-tag>
    </button>
  </div>
</template>

<script setup lang="ts">
import type {
  SeasonalCropSummary,
  SeasonalRecommendationItem,
} from '../../api/region-selection';

const props = defineProps<{
  items: SeasonalRecommendationItem[];
  cropById: Record<string, SeasonalCropSummary>;
}>();

defineEmits<{
  select: [item: SeasonalRecommendationItem];
}>();

function seasonLabel(s: string): string {
  return { in_window: '现在适合', too_early: '还没到时候', too_late: '已过时令', no_data: '暂无数据' }[s] || s;
}

function startMethodText(methods: string[]): string {
  const hasSeed = methods.includes('direct_seed');
  const hasNursery = methods.includes('nursery_plant');
  if (hasSeed && hasNursery) return '买苗 / 直播均可';
  if (hasSeed) return '建议直播';
  if (hasNursery) return '建议买苗';
  return '';
}

function harvestText(crop?: SeasonalCropSummary): string {
  if (!crop) return '';
  if (typeof crop.harvestDaysMin === 'number' && typeof crop.harvestDaysMax === 'number') {
    return `${crop.harvestDaysMin}-${crop.harvestDaysMax} 天采收`;
  }
  if (typeof crop.harvestDaysMin === 'number') return `${crop.harvestDaysMin} 天起采收`;
  if (typeof crop.harvestDaysMax === 'number') return `${crop.harvestDaysMax} 天内采收`;
  return '';
}

function coverImage(item: SeasonalRecommendationItem): string {
  return props.cropById[item.crop_id]?.coverImage || '';
}
</script>

<style scoped>
.plant-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.plant-card {
  width: 100%;
  min-height: 158px;
  border: 0;
  border-radius: 8px;
  background: #fff;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 7px;
  text-align: left;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
}
.plant-card__media {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  background: #eef4ef;
  color: #7d8b80;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.plant-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.plant-card__media :deep(.van-icon) {
  font-size: 24px;
}
.plant-card__body {
  min-width: 0;
  flex: 1 1 auto;
}
.plant-card strong,
.plant-card small {
  display: block;
}
.plant-card strong {
  color: #1f2d24;
  font-size: 14px;
  line-height: 1.25;
}
.plant-card small {
  margin-top: 4px;
  color: #7d8b80;
  font-size: 11px;
  line-height: 1.25;
}
.plant-card :deep(.van-tag) {
  align-self: flex-start;
  max-width: 100%;
  white-space: normal;
  line-height: 1.2;
}
@media (max-width: 359px) {
  .plant-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
