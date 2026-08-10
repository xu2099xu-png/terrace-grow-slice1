<template>
  <div class="seasonal-home">
    <van-nav-bar title="时令种植" fixed />

    <div v-if="locationState === 'resolving'" class="state">
      <van-loading type="spinner" color="#2ba84a" />
      <p>正在确认所在区县…</p>
    </div>

    <div v-else-if="locationState === 'picking'" class="content">
      <section class="hero">
        <span>选择区县</span>
        <h1>看看今天适合种什么</h1>
        <p>按区县匹配天气、时令和农业气候区。</p>
      </section>
      <div v-if="locationMessage" class="banner mild">{{ locationMessage }}</div>
      <RegionPicker :selected-region="selectedRegion" @select="handleRegionSelect" />
    </div>

    <div v-else class="content">
      <section class="topbar">
        <div>
          <span class="eyebrow">当前区县</span>
          <h1>{{ selectedRegionLabel }}</h1>
        </div>
        <van-button size="small" round plain type="primary" @click="startPicking">更换</van-button>
      </section>

      <div v-if="loadingHome" class="state state--inline">
        <van-loading type="spinner" color="#2ba84a" />
        <p>加载今日时令…</p>
      </div>

      <div v-else-if="homeError" class="state state--inline">
        <p>{{ homeError }}</p>
        <van-button round type="primary" @click="loadHome">重试</van-button>
        <van-button round plain @click="startPicking">重新选择区县</van-button>
      </div>

      <template v-else-if="home">
        <section class="today-panel">
          <div>
            <span class="eyebrow">今天</span>
            <h2>{{ home.today.date }} · 周{{ home.today.weekday }}</h2>
          </div>
          <p>
            <span v-if="home.today.lunar.status === 'available'">
              农历{{ home.today.lunar.month }}月{{ home.today.lunar.day }}
            </span>
            <span v-else>农历暂不可用</span>
            <span v-if="home.today.solar_term"> · {{ home.today.solar_term }}</span>
          </p>
        </section>

        <section class="weather-panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">区县天气</span>
              <h2>{{ weatherStatusText }}</h2>
            </div>
            <van-tag :type="home.weather.status === 'available' ? 'success' : 'warning'" round>
              {{ weatherBadgeText }}
            </van-tag>
          </div>
          <p class="weather-summary">{{ home.weather.summary || '天气暂不可用' }}</p>
          <div class="weather-grid">
            <span>当前 {{ formatNumber(home.weather.temperature_current_c, '°C') }}</span>
            <span>最高 {{ formatNumber(home.weather.temperature_max_c, '°C') }}</span>
            <span>最低 {{ formatNumber(home.weather.temperature_min_c, '°C') }}</span>
            <span>降水 {{ formatNumber(home.weather.precipitation_probability_percent, '%') }}</span>
          </div>
          <div v-if="home.weather.warnings.length" class="warning-list">
            <span
              v-for="(warning, warningIndex) in home.weather.warnings"
              :key="`warning-${warningIndex}-${warning}`"
            >
              {{ warning }}
            </span>
          </div>
          <div class="attribution">
            <a
              v-if="home.weather.attribution.name && home.weather.attribution.url"
              :href="home.weather.attribution.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ home.weather.attribution.name }}
            </a>
            <template v-if="home.weather.attribution.sources.length">
              <span
                v-for="(source, sourceIndex) in home.weather.attribution.sources"
                :key="`source-${sourceIndex}-${source}`"
              >
                {{ source }}
              </span>
            </template>
          </div>
        </section>

        <div v-if="home.agri_region_match.proxy_used" class="banner mild">
          使用 {{ home.agri_region_match.proxy_name }} 作为近似农业气候区
          <span v-if="home.agri_region_match.distance_km !== null">，约 {{ home.agri_region_match.distance_km }}km</span>
        </div>
        <div v-if="home.seasonal.climate_data_status === 'unsupported'" class="banner warn">
          当前地区的种植数据还在完善
        </div>

        <section class="recommend-section">
          <div class="section-head">
            <h2>今日推荐</h2>
            <span>{{ home.seasonal.items.length }} 项</span>
          </div>
          <template v-if="home.seasonal.items.length">
            <button
              v-for="item in home.seasonal.items"
              :key="item.crop_id"
              type="button"
              class="crop-card"
              data-testid="seasonal-item"
              @click="goCrop(item)"
              @keydown.enter.prevent="goCrop(item)"
              @keydown.space.prevent="goCrop(item)"
            >
              <span>
                <strong>{{ item.crop_name }}</strong>
                <small>{{ startMethodLabel(item.available_start_methods || []) }}</small>
              </span>
              <van-tag :type="item.season_status === 'in_window' ? 'success' : 'default'" round>
                {{ seasonLabel(item.season_status || '') }}
              </van-tag>
            </button>
          </template>
          <van-empty v-else description="当前没有可种的作物">
            <van-button round type="primary" @click="startPicking">更换区县</van-button>
          </van-empty>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RegionPicker from '../components/RegionPicker.vue';
import {
  fetchSeasonalHome,
  loadSelectedRegion,
  resolveLocation,
  saveSelectedRegion,
  toSelectedRegionMetadata,
  type SeasonalHomePayload,
  type SeasonalRecommendationItem,
  type SelectedRegionMetadata,
} from '../api/region-selection';

type LocationState = 'resolving' | 'picking' | 'ready';

const router = useRouter();
const route = useRoute();
const locationState = ref<LocationState>('resolving');
const selectedRegion = ref<SelectedRegionMetadata | null>(null);
const locationMessage = ref('');
const home = ref<SeasonalHomePayload | null>(null);
const loadingHome = ref(false);
const homeError = ref('');

const selectedRegionLabel = computed(() => {
  if (!selectedRegion.value) return '请选择区县';
  return `${selectedRegion.value.province_name} · ${selectedRegion.value.city_name} · ${selectedRegion.value.name}`;
});
const weatherStatusText = computed(() => {
  const status = home.value?.weather.status;
  if (status === 'available') return '可用';
  if (status === 'partial') return '部分可用';
  return '暂不可用';
});
const weatherBadgeText = computed(() => {
  const weather = home.value?.weather;
  if (!weather || weather.status === 'unavailable') return '不可用';
  if (weather.status === 'partial') return weather.cache_hit ? '部分缓存' : '部分';
  return weather.cache_hit ? '缓存' : '实时';
});

function canUseGeolocation(): boolean {
  const host = window.location.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === '';
  return (window.isSecureContext || isLocalDev) && !!navigator.geolocation;
}

async function requestLocation() {
  if (!canUseGeolocation()) {
    locationMessage.value = '无法使用浏览器定位，请手动选择区县。';
    locationState.value = 'picking';
    return;
  }
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 });
    });
    const resolved = await resolveLocation(pos.coords.latitude, pos.coords.longitude);
    if (!resolved) {
      locationMessage.value = '定位暂未匹配到支持区县，请手动选择。';
      locationState.value = 'picking';
      return;
    }
    const metadata = toSelectedRegionMetadata(resolved);
    saveSelectedRegion(metadata);
    selectedRegion.value = metadata;
    locationState.value = 'ready';
    await loadHome();
  } catch (e) {
    locationMessage.value = '定位未完成，请手动选择区县。';
    locationState.value = 'picking';
  }
}

async function loadHome() {
  if (!selectedRegion.value) return;
  loadingHome.value = true;
  homeError.value = '';
  try {
    home.value = await fetchSeasonalHome(selectedRegion.value.admin_code);
    if (home.value.region) {
      const metadata = toSelectedRegionMetadata(home.value.region);
      selectedRegion.value = metadata;
      saveSelectedRegion(metadata);
    }
  } catch (e: any) {
    homeError.value = e.response?.data?.message || '今日时令加载失败';
  } finally {
    loadingHome.value = false;
  }
}

function handleRegionSelect(region: SelectedRegionMetadata) {
  selectedRegion.value = region;
  saveSelectedRegion(region);
  locationState.value = 'ready';
  home.value = null;
  loadHome();
}

function startPicking() {
  locationMessage.value = '';
  locationState.value = 'picking';
}

function formatNumber(value: number | null, suffix: string): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '—';
}

function seasonLabel(s: string): string {
  return { in_window: '现在适合', too_early: '还没到时候', too_late: '已过时令', no_data: '暂无数据' }[s] || s || '推荐';
}

function startMethodLabel(methods: string[]): string {
  const hasSeed = methods.includes('direct_seed');
  const hasNursery = methods.includes('nursery_plant');
  if (hasSeed && hasNursery) return '买苗 / 直播均可';
  if (hasSeed) return '建议直播';
  if (hasNursery) return '建议买苗';
  return '查看详情';
}

function goCrop(item: SeasonalRecommendationItem) {
  const query: Record<string, string> = {
    admin_code: selectedRegion.value?.admin_code || '',
  };
  if (item.available_start_methods?.length) {
    query.start_methods = item.available_start_methods.join(',');
  }
  router.push({ path: `/crops/${item.crop_id}`, query });
}

onMounted(async () => {
  const queryAdminCode = typeof route.query.admin_code === 'string' ? route.query.admin_code : '';
  const stored = loadSelectedRegion();
  if (stored && (!queryAdminCode || stored.admin_code === queryAdminCode)) {
    selectedRegion.value = stored;
    locationState.value = 'ready';
    await loadHome();
    return;
  }
  if (queryAdminCode) {
    selectedRegion.value = {
      admin_code: queryAdminCode,
      name: queryAdminCode,
      province_name: '已选地区',
      city_name: '待确认',
      selected_at: new Date().toISOString(),
    };
    locationState.value = 'ready';
    await loadHome();
    return;
  }
  await requestLocation();
});
</script>

<style scoped>
.seasonal-home {
  min-height: 100vh;
  padding-top: 46px;
  background: #f5f7f4;
}
.content {
  padding: 14px 16px 20px;
}
.state {
  min-height: calc(100vh - 46px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #646566;
}
.state--inline {
  min-height: 240px;
}
.hero {
  margin: 4px 0 14px;
  text-align: left;
}
.hero span,
.eyebrow {
  display: block;
  color: #2f8f4e;
  font-size: 12px;
  font-weight: 600;
}
.hero h1,
.topbar h1 {
  margin: 4px 0;
  color: #1f2d24;
  font-size: 22px;
  line-height: 1.25;
}
.hero p,
.today-panel p,
.weather-summary {
  margin: 0;
  color: #646566;
  font-size: 14px;
  line-height: 1.5;
}
.topbar,
.panel-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.today-panel,
.weather-panel {
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
}
.today-panel h2,
.weather-panel h2,
.section-head h2 {
  margin: 3px 0;
  color: #1f2d24;
  font-size: 17px;
  line-height: 1.3;
}
.weather-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.weather-grid span {
  border-radius: 8px;
  background: #f4f8f5;
  padding: 8px;
  color: #435146;
  font-size: 13px;
}
.warning-list,
.attribution {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.warning-list span {
  color: #b56b00;
  background: #fff7e6;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
}
.attribution a,
.attribution span {
  color: #6f7f73;
  font-size: 12px;
  line-height: 1.4;
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
.banner.mild {
  background: #edf7ef;
  color: #2b7042;
}
.recommend-section {
  margin-top: 14px;
}
.section-head {
  margin-bottom: 8px;
}
.section-head span {
  color: #969799;
  font-size: 12px;
}
.crop-card {
  width: 100%;
  min-height: 72px;
  border: 0;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
}
.crop-card strong,
.crop-card small {
  display: block;
}
.crop-card strong {
  color: #1f2d24;
  font-size: 16px;
}
.crop-card small {
  margin-top: 5px;
  color: #7d8b80;
  font-size: 13px;
}
</style>
