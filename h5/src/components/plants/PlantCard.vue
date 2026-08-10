<template>
  <button
    class="plant-card crop-card"
    type="button"
    :disabled="disabled"
    :aria-disabled="disabled"
    :aria-label="`${crop.name}：${command}`"
    @click="$emit('select')"
  >
    <span class="plant-card__media" aria-hidden="true">
      <img v-if="crop.coverImage" :src="crop.coverImage" :alt="crop.name" loading="lazy">
      <span v-else class="plant-card__placeholder">{{ crop.name.slice(0, 1) }}</span>
    </span>
    <span class="plant-card__body">
      <strong>{{ crop.name }}</strong>
      <small v-if="crop.latinName">{{ crop.latinName }}</small>
      <span v-if="facts.length" class="plant-card__facts">
        <span v-for="fact in facts" :key="fact">{{ fact }}</span>
      </span>
    </span>
    <span class="plant-card__meta">
      <span class="plant-card__command">{{ command }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CropSummary } from '../../api/catalog';
import { categoryLabel, difficultyLabel, lifeTypeLabel } from './plant-labels';

const props = defineProps<{
  crop: CropSummary;
  command: string;
  disabled?: boolean;
}>();

defineEmits<{ select: [] }>();

const facts = computed(() => {
  const parts = [
    props.crop.lifeType ? lifeTypeLabel(props.crop.lifeType) : '',
    props.crop.category ? categoryLabel(props.crop.category) : '',
    props.crop.difficulty ? difficultyLabel(props.crop.difficulty) : '',
  ].filter(Boolean);
  return parts;
});
</script>

<style scoped>
.plant-card {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: #fff;
  padding: 12px;
  min-height: 104px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.plant-card:active {
  background: #f7f8fa;
}
.plant-card:disabled {
  opacity: 0.72;
  cursor: wait;
}
.plant-card__body {
  flex: 1;
  min-width: 0;
}
.plant-card__media {
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background: #f2f3f5;
  color: #646566;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}
.plant-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.plant-card strong {
  display: block;
  color: #323233;
  font-size: 17px;
  line-height: 1.3;
}
.plant-card small {
  display: block;
  margin-top: 6px;
  color: #969799;
  font-size: 13px;
  line-height: 1.4;
}
.plant-card__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.plant-card__facts span {
  border-radius: 999px;
  background: #f7f8fa;
  color: #646566;
  padding: 3px 7px;
  font-size: 12px;
  line-height: 1.2;
}
.plant-card__meta {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.plant-card__command {
  min-width: 72px;
  border-radius: 999px;
  padding: 7px 12px;
  color: #fff;
  background: #1989fa;
  font-size: 13px;
  line-height: 1;
  text-align: center;
  font-weight: 600;
}

@media (max-width: 360px) {
  .plant-card {
    align-items: flex-start;
  }
  .plant-card__meta {
    align-self: center;
  }
}
</style>
