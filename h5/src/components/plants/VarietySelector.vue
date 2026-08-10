<template>
  <van-cell-group v-if="varieties.length" inset title="品种">
    <van-radio-group :model-value="modelValue" @update:model-value="emitValue">
      <van-cell
        v-for="variety in varieties"
        :key="variety.id"
        clickable
        :title="variety.name"
        :label="varietyLabel(variety)"
        @click="emitValue(variety.id)"
      >
        <template #right-icon>
          <van-radio :name="variety.id" />
        </template>
      </van-cell>
    </van-radio-group>
  </van-cell-group>
</template>

<script setup lang="ts">
import type { VarietySummary } from '../../api/catalog';

defineProps<{
  varieties: VarietySummary[];
  modelValue: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function emitValue(value: unknown) {
  if (typeof value === 'string') emit('update:modelValue', value);
}

function varietyLabel(variety: VarietySummary): string {
  const parts = [
    variety.maturePeriod ? `成熟期：${variety.maturePeriod}` : '',
    variety.plantHabit ? `株型：${variety.plantHabit}` : '',
    variety.containerFit ? `容器适配：${variety.containerFit}/5` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
</script>
