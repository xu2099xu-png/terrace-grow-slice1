<template>
  <div class="crop-detail">
    <van-nav-bar :title="crop?.name || '作物详情'" fixed left-arrow @click-left="router.back()" />

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>加载中…</p>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <van-button block round @click="load">重试</van-button>
    </div>

    <div v-else-if="crop" class="content">
      <BasicInfo :crop="crop" :contextual-start-methods="contextualStartMethods" />
      <VarietySelector v-model="selectedVarietyId" :varieties="varieties" />
      <KeyFacts :crop="crop" />
      <Environment :requirements="crop.environmentRequirement || []" />
      <KnowledgeAccordion :crop="crop" />

      <van-cell-group v-if="calendars.length" :inset="true" :title="calendarTitle">
        <van-cell
          v-for="c in calendars"
          :key="c.id"
          :title="`${methodLabel(c.startMethod)}：${c.windowStart} → ${c.windowEnd}`"
          :label="`窗口 ${c.windowKey}`"
        />
      </van-cell-group>

      <div v-if="crop.lifeType === 'perennial'" class="actions">
        <van-button type="success" block round @click="goPlan">查看种植方案</van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  fetchCropDetail,
  fetchCropVarieties,
  type CropSummary,
  type VarietySummary,
} from '../api/catalog';
import BasicInfo from '../components/plants/BasicInfo.vue';
import Environment from '../components/plants/Environment.vue';
import KeyFacts from '../components/plants/KeyFacts.vue';
import KnowledgeAccordion from '../components/plants/KnowledgeAccordion.vue';
import VarietySelector from '../components/plants/VarietySelector.vue';

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const loading = ref(true);
const error = ref('');
const crop = ref<CropSummary | null>(null);
const varieties = ref<VarietySummary[]>([]);
const selectedVarietyId = ref(queryString(route.query.variety_id));
const hasCityContext = computed(() => !!queryString(route.query.city_code));
const contextualStartMethods = computed(() => {
  const raw = queryString(route.query.start_methods);
  if (!raw) return [];
  return raw
    .split(',')
    .filter((method) => method === 'direct_seed' || method === 'nursery_plant');
});

const calendarTitle = computed(() =>
  hasCityContext.value ? '播种窗口（本气候区）' : '播种窗口',
);
const calendars = computed(() => (crop.value?.sowingCalendars as any[]) || []);

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

function methodLabel(m: string): string {
  return { nursery_plant: '买苗', direct_seed: '直播' }[m] || m;
}

function planQuery(): Record<string, string> {
  const query: Record<string, string> = {};
  const adminCode = queryString(route.query.admin_code);
  const cityCode = queryString(route.query.city_code);
  if (adminCode) query.admin_code = adminCode;
  if (cityCode) query.city_code = cityCode;
  if (selectedVarietyId.value) query.variety_id = selectedVarietyId.value;
  return query;
}

function goPlan() {
  router.push({
    path: `/perennial/${props.id}/plan`,
    query: planQuery(),
  });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const cityCode = queryString(route.query.city_code);
    const [detail, varietyRows] = await Promise.all([
      fetchCropDetail(props.id, cityCode ? { city_code: cityCode } : {}),
      fetchCropVarieties(props.id),
    ]);
    crop.value = detail;
    varieties.value = varietyRows;
    const routeVarietyId = queryString(route.query.variety_id);
    selectedVarietyId.value = varietyRows.some((v) => v.id === routeVarietyId)
      ? routeVarietyId
      : '';
  } catch (e: any) {
    crop.value = null;
    varieties.value = [];
    error.value = e.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.id, () => {
  void load();
});
</script>

<style scoped>
.crop-detail {
  padding-top: 46px;
  padding-bottom: 24px;
}
.loading, .error {
  text-align: center;
  padding: 120px 16px 0;
}
.content {
  padding: 16px;
}
.content > * {
  margin-bottom: 12px;
}
.actions {
  padding: 4px 16px 16px;
}
</style>
