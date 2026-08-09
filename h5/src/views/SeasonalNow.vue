<template>
  <div class="seasonal-now">
    <van-nav-bar title="这个季节种什么" fixed left-arrow @click-left="router.back()" />

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>加载中…</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <van-button block round @click="load">重试</van-button>
    </div>

    <div v-else-if="result" class="content">
      <!-- 顶部状态提示（AC-07/AC-09） -->
      <div v-if="result.climate_data_status === 'unsupported'" class="banner warn">
        当前地区的种植数据还在完善
      </div>
      <div v-else-if="result.weather_data_status !== 'available'" class="banner mild">
        暂未结合近期天气
      </div>

      <template v-if="result.items.length">
        <div
          v-for="item in result.items"
          :key="item.crop_id"
          class="crop-card"
          @click="goDetail(item)"
        >
          <div class="card-head">
            <span class="name">{{ item.crop_name }}</span>
            <van-tag :type="seasonTagType(item.season_status)" round>{{ seasonLabel(item.season_status) }}</van-tag>
          </div>
          <div class="card-row">
            <span class="label">怎么开始</span>
            <span class="value start-method">{{ startMethodLabel(item.available_start_methods) }}</span>
          </div>
          <div class="card-row">
            <span class="label">难度</span>
            <span class="value">{{ difficultyLabel(item) }}</span>
          </div>
          <div v-if="item.warnings.length" class="card-row">
            <span class="label">关键风险</span>
            <span class="value risk">{{ item.warnings.join('；') }}</span>
          </div>
        </div>
      </template>
      <van-empty v-else description="当前没有可种的作物" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../api/client';

interface SeasonalItem {
  crop_id: string;
  crop_name: string;
  available_start_methods: string[];
  season_status: string;
  weather_assessment: string;
  difficulty: number;
  warnings: string[];
}
interface SeasonalResult {
  climate_data_status: string;
  weather_data_status: string;
  items: SeasonalItem[];
}

const router = useRouter();
const route = useRoute();
const loading = ref(true);
const error = ref('');
const result = ref<SeasonalResult | null>(null);

// closure-6: keep the city context when opening the crop detail so the detail
// page only shows the current climate zone's sowing windows.
function goDetail(item: SeasonalItem) {
  const query: Record<string, string> = {
    start_methods: item.available_start_methods.join(','),
  };
  if (route.query.city_code) query.city_code = String(route.query.city_code);
  router.push({
    path: `/crops/${item.crop_id}`,
    query,
  });
}

function seasonLabel(s: string): string {
  return { in_window: '现在适合', too_early: '还没到时候', too_late: '已过时令', no_data: '暂无数据' }[s] || s;
}
function seasonTagType(s: string): string {
  return s === 'in_window' ? 'success' : 'default';
}
function difficultyLabel(item: SeasonalItem): string {
  return { 1: '新手友好', 2: '有点难度', 3: '较有挑战', 4: '有难度', 5: '高手向' }[item.difficulty] || `难度${item.difficulty}`;
}
function startMethodLabel(methods: string[]): string {
  if (!methods || methods.length === 0) return '—';
  const hasSeed = methods.includes('direct_seed');
  const hasNursery = methods.includes('nursery_plant');
  if (hasSeed && hasNursery) return '买苗 / 直播均可';
  if (hasSeed) return '建议直播';
  if (hasNursery) return '建议买苗';
  return methods.join(', ');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const cityCode = String(route.query.city_code || '');
    if (!cityCode) {
      error.value = '缺少城市信息';
      return;
    }
    const res = await api.get(`/seasons/now?city_code=${cityCode}`);
    result.value = res.data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.seasonal-now {
  padding-top: 46px;
}
.loading, .error {
  text-align: center;
  padding-top: 120px;
}
.content {
  padding: 16px;
}
.banner {
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}
.banner.warn { background: #fff7e6; color: #b8860b; }
.banner.mild { background: #f2f3f5; color: #666; }
.crop-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.card-head .name { font-size: 17px; font-weight: 600; }
.card-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 2px 0;
}
.card-row .label { color: #999; }
.card-row .value.start-method { color: #07c160; font-weight: 600; }
.card-row .value.risk { color: #ee0a24; text-align: right; }
</style>
