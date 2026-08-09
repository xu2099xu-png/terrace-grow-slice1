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
      <van-cell-group inset title="基本信息">
        <van-cell title="作物" :value="crop.name" />
        <van-cell title="学名" :value="crop.latinName || '—'" />
        <van-cell title="难度" :value="difficultyLabel" />
        <van-cell title="开始方式" :value="startMethodLabel" />
        <van-cell v-if="crop.startMethodNote" :title="crop.startMethodNote" />
      </van-cell-group>

      <van-cell-group v-if="crop.environmentRequirement?.length" inset title="环境要求">
        <van-cell
          v-for="env in crop.environmentRequirement"
          :key="env.id"
          :title="`${env.minSunHours}h 以上日照`"
          :label="env.frostSensitive ? '怕霜冻，注意防寒' : '较耐寒'"
        />
      </van-cell-group>

      <van-cell-group v-if="calendars.length" :inset="true" :title="calendarTitle">
        <van-cell
          v-for="c in calendars"
          :key="c.id"
          :title="`${methodLabel(c.startMethod)}：${c.windowStart} → ${c.windowEnd}`"
          :label="`窗口 ${c.windowKey}`"
        />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api/client';

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const loading = ref(true);
const error = ref('');
const crop = ref<any>(null);
const hasCityContext = computed(() => !!route.query.city_code);
const contextualStartMethods = computed(() => {
  const queryValue = route.query.start_methods;
  const raw = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .filter((method) => method === 'direct_seed' || method === 'nursery_plant');
});

const calendarTitle = computed(() =>
  hasCityContext.value ? '播种窗口（本气候区）' : '播种窗口',
);

const difficultyLabel = computed(() => {
  const d = crop.value?.difficulty;
  return { 1: '新手友好', 2: '有点难度', 3: '较有挑战', 4: '有难度', 5: '高手向' }[d] || `难度${d}`;
});
const startMethodLabel = computed(() => {
  if (contextualStartMethods.value.length > 0) {
    const hasSeed = contextualStartMethods.value.includes('direct_seed');
    const hasNursery = contextualStartMethods.value.includes('nursery_plant');
    if (hasSeed && hasNursery) return '买苗 / 直播均可';
    if (hasSeed) return '建议直播';
    return '建议买苗';
  }
  const m = crop.value?.recommendedStartMethod;
  return { nursery_plant: '建议买苗', direct_seed: '建议直播', either: '买苗 / 直播均可' }[m] || m || '—';
});
const calendars = computed(() => crop.value?.sowingCalendars || []);

function methodLabel(m: string): string {
  return { nursery_plant: '买苗', direct_seed: '直播' }[m] || m;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // closure-6: scope sowing windows to the current climate zone when the
    // user came from a seasonal recommendation (city_code in the query).
    const query = route.query.city_code
      ? `?city_code=${encodeURIComponent(String(route.query.city_code))}`
      : '';
    const res = await api.get(`/crops/${props.id}${query}`);
    crop.value = res.data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.crop-detail {
  padding-top: 46px;
}
.loading, .error {
  text-align: center;
  padding-top: 120px;
}
.content {
  padding: 16px;
}
</style>
