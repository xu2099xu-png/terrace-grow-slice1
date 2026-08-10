<template>
  <van-cell-group v-if="sections.length" inset title="知识">
    <van-collapse v-model="active">
      <van-collapse-item
        v-for="section in sections"
        :key="section.title"
        :title="section.title"
        :name="section.title"
      >
        <p v-for="line in section.lines" :key="line">{{ line }}</p>
      </van-collapse-item>
    </van-collapse>
  </van-cell-group>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CropSummary } from '../../api/catalog';

const props = defineProps<{ crop: CropSummary }>();
const active = ref<string[]>([]);

const sections = computed(() => {
  const crop = props.crop as Record<string, unknown>;
  return [
    normalizeSection('养护要点', crop.knowledge || crop.knowledgeSections || crop.careNotes),
    normalizeSection('种植提示', crop.growingTips || crop.tips),
    normalizeSection('常见问题', crop.faq || crop.faqs),
  ].filter((section): section is { title: string; lines: string[] } => !!section && section.lines.length > 0);
});

function normalizeSection(title: string, value: unknown): { title: string; lines: string[] } | null {
  if (typeof value === 'string' && value.trim()) return { title, lines: [value.trim()] };
  if (Array.isArray(value)) {
    const lines = value.flatMap((item) => {
      if (typeof item === 'string') return [item.trim()].filter(Boolean);
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      return [record.title, record.content, record.text]
        .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
        .map((line) => line.trim());
    });
    return lines.length ? { title, lines } : null;
  }
  return null;
}
</script>
