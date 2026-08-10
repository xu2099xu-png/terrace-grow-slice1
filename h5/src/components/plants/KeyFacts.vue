<template>
  <van-cell-group v-if="facts.length" inset title="关键事实">
    <van-cell v-for="fact in facts" :key="fact.label" :title="fact.label" :value="fact.value" />
  </van-cell-group>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CropSummary } from '../../api/catalog';
import { acidityLabel } from './plant-labels';

const props = defineProps<{ crop: CropSummary }>();

const facts = computed(() => {
  const rows: { label: string; value: string }[] = [];
  if (props.crop.harvestDaysMin || props.crop.harvestDaysMax) {
    const min = props.crop.harvestDaysMin;
    const max = props.crop.harvestDaysMax;
    rows.push({ label: '收获周期', value: min && max ? `${min}-${max} 天` : `${min || max} 天` });
  }
  if (typeof props.crop.containerFriendly === 'boolean') {
    rows.push({ label: '容器友好', value: props.crop.containerFriendly ? '是' : '否' });
  }
  if (props.crop.acidityNeed) {
    rows.push({ label: '土壤酸碱', value: acidityLabel(props.crop.acidityNeed) });
  }
  if (typeof props.crop.requiresAcidification === 'boolean') {
    rows.push({ label: '需要调酸', value: props.crop.requiresAcidification ? '是' : '否' });
  }
  if (props.crop.waterloggingSensitivity) {
    rows.push({ label: '怕涝程度', value: `${props.crop.waterloggingSensitivity}/5` });
  }
  return rows;
});
</script>
