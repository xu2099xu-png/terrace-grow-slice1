<template>
  <section class="recommend-section">
    <SectionHeader title="今日推荐">
      <template #action>
        <span class="count">{{ seasonal.items.length }} 项</span>
      </template>
    </SectionHeader>
    <div v-if="seasonal.climate_data_status === 'unsupported'" class="banner warn">
      当前地区的种植数据还在完善
    </div>
    <div v-if="seasonal.warnings.length" class="warning-stack">
      <span v-for="(warning, index) in seasonal.warnings" :key="`seasonal-warning-${index}-${warning}`">
        {{ warning }}
      </span>
    </div>
    <PlantCardGrid
      v-if="seasonal.items.length"
      :items="seasonal.items"
      :crop-by-id="cropById"
      @select="$emit('select', $event)"
    />
    <van-empty v-else description="当前没有可种的作物">
      <van-button round type="primary" @click="$emit('change-location')">更换区县</van-button>
    </van-empty>
  </section>
</template>

<script setup lang="ts">
import SectionHeader from '../shared/SectionHeader.vue';
import PlantCardGrid from './PlantCardGrid.vue';
import type {
  SeasonalCropSummary,
  SeasonalHomePayload,
  SeasonalRecommendationItem,
} from '../../api/region-selection';

defineProps<{
  seasonal: SeasonalHomePayload['seasonal'];
  cropById: Record<string, SeasonalCropSummary>;
}>();

defineEmits<{
  select: [item: SeasonalRecommendationItem];
  'change-location': [];
}>();
</script>

<style scoped>
.recommend-section {
  margin-top: 14px;
}
.count {
  color: #969799;
  font-size: 12px;
}
.banner {
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.45;
}
.banner.warn {
  background: #fff7e6;
  color: #b56b00;
}
.warning-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.warning-stack span {
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff7e6;
  color: #b56b00;
  font-size: 13px;
}
</style>
