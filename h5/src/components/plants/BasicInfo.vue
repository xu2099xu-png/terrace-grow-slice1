<template>
  <section class="basic-info">
    <div class="basic-info__media" aria-hidden="true">
      <img v-if="crop.coverImage" :src="crop.coverImage" :alt="crop.name" loading="lazy">
      <span v-else>{{ crop.name.slice(0, 1) }}</span>
    </div>
    <van-cell-group inset title="基本信息">
      <van-cell title="作物" :value="crop.name" />
      <van-cell v-if="crop.latinName" title="学名" :value="crop.latinName" />
      <van-cell title="类型" :value="lifeTypeLabel(crop.lifeType)" />
      <van-cell title="分类" :value="categoryLabel(crop.category)" />
      <van-cell title="难度" :value="difficultyLabel(crop.difficulty)" />
      <van-cell title="开始方式" :value="startMethod" />
      <van-cell v-if="crop.startMethodNote" :title="crop.startMethodNote" />
    </van-cell-group>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CropSummary } from '../../api/catalog';
import { categoryLabel, difficultyLabel, lifeTypeLabel, startMethodLabel } from './plant-labels';

const props = defineProps<{
  crop: CropSummary;
  contextualStartMethods?: string[];
}>();

const startMethod = computed(() => {
  const methods = props.contextualStartMethods || [];
  const hasSeed = methods.includes('direct_seed');
  const hasNursery = methods.includes('nursery_plant');
  if (hasSeed && hasNursery) return '买苗 / 直播均可';
  if (hasSeed) return '建议直播';
  if (hasNursery) return '建议买苗';
  return startMethodLabel(props.crop.recommendedStartMethod);
});
</script>

<style scoped>
.basic-info__media {
  height: 140px;
  margin: 0 16px 12px;
  border-radius: 8px;
  overflow: hidden;
  background: #f2f3f5;
  color: #646566;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 700;
}
.basic-info__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
