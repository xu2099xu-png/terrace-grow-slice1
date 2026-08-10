<template>
  <div class="seasonal-home">
    <van-nav-bar title="时令种植" fixed />

    <AsyncState v-if="redirecting" message="正在前往地区选择…" loading />

    <div v-else class="content">
      <LocationHeader
        :selected-region="selectedRegion"
        :region="home?.region || null"
        @change="goLocationPicker"
      />

      <AsyncState v-if="loadingHome" message="加载今日时令…" loading inline />

      <AsyncState v-else-if="homeError" :message="homeError" inline>
        <van-button round type="primary" @click="loadHome">重试</van-button>
        <van-button round plain @click="goLocationPicker">重新选择区县</van-button>
      </AsyncState>

      <template v-else-if="home">
        <section class="overview-section">
          <SectionHeader title="今日概览" />
          <div class="overview-grid">
            <EnvironmentSummary
              :weather="home.weather"
              :agri-match="home.agri_region_match"
            />
            <CalendarSummary :today="home.today" />
          </div>
        </section>
        <SeasonalRecommendationSection
          :seasonal="home.seasonal"
          :crop-by-id="cropById"
          @select="goCrop"
          @change-location="goLocationPicker"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AsyncState from '../components/shared/AsyncState.vue';
import CalendarSummary from '../components/home/CalendarSummary.vue';
import EnvironmentSummary from '../components/home/EnvironmentSummary.vue';
import LocationHeader from '../components/home/LocationHeader.vue';
import SeasonalRecommendationSection from '../components/home/SeasonalRecommendationSection.vue';
import SectionHeader from '../components/shared/SectionHeader.vue';
import {
  fetchSeasonalCrops,
  fetchSeasonalHome,
  loadSelectedRegion,
  saveSelectedRegion,
  toSelectedRegionMetadata,
  type SeasonalCropSummary,
  type SeasonalHomePayload,
  type SeasonalRecommendationItem,
  type SelectedRegionMetadata,
} from '../api/region-selection';

const router = useRouter();
const route = useRoute();
const selectedRegion = ref<SelectedRegionMetadata | null>(null);
const home = ref<SeasonalHomePayload | null>(null);
const seasonalCrops = ref<SeasonalCropSummary[]>([]);
const loadingHome = ref(false);
const homeError = ref('');
const redirecting = ref(false);

const cropById = computed<Record<string, SeasonalCropSummary>>(() => {
  return Object.fromEntries(seasonalCrops.value.map((crop) => [crop.id, crop]));
});

function currentReturnTo(): string {
  return typeof route.fullPath === 'string' && route.fullPath ? route.fullPath : '/';
}

function goLocationPicker() {
  router.push({
    path: '/location',
    query: { return_to: currentReturnTo() },
  });
}

function regionFromQuery(): SelectedRegionMetadata | null {
  const queryAdminCode = typeof route.query.admin_code === 'string' ? route.query.admin_code : '';
  if (!queryAdminCode) return null;
  const stored = loadSelectedRegion();
  if (stored?.admin_code === queryAdminCode) return stored;
  return {
    admin_code: queryAdminCode,
    name: queryAdminCode,
    province_name: '已选地区',
    city_name: '待确认',
    selected_at: new Date().toISOString(),
  };
}

async function loadHome() {
  if (!selectedRegion.value) {
    redirecting.value = true;
    goLocationPicker();
    return;
  }
  loadingHome.value = true;
  homeError.value = '';
  try {
    const [homePayload, cropRows] = await Promise.all([
      fetchSeasonalHome(selectedRegion.value.admin_code),
      fetchSeasonalCrops().catch(() => []),
    ]);
    home.value = homePayload;
    seasonalCrops.value = cropRows;
    if (homePayload.region) {
      const metadata = toSelectedRegionMetadata(homePayload.region);
      selectedRegion.value = metadata;
      saveSelectedRegion(metadata);
    }
  } catch (e: any) {
    homeError.value = e.response?.data?.message || '今日时令加载失败';
  } finally {
    loadingHome.value = false;
  }
}

function canonicalCityCode(item: SeasonalRecommendationItem): string {
  const fromItem = item.city_code;
  const fromRegion = (home.value?.region as any)?.city_code;
  const fromSeasonal = (home.value?.seasonal as any)?.city_code;
  return [fromItem, fromRegion, fromSeasonal].find((value) => typeof value === 'string' && value) || '';
}

function goCrop(item: SeasonalRecommendationItem) {
  const query: Record<string, string> = {
    admin_code: selectedRegion.value?.admin_code || '',
  };
  const cityCode = canonicalCityCode(item);
  if (cityCode) {
    query.city_code = cityCode;
  }
  if (item.available_start_methods?.length) {
    query.start_methods = item.available_start_methods.join(',');
  }
  router.push({ path: `/crops/${item.crop_id}`, query });
}

onMounted(async () => {
  selectedRegion.value = regionFromQuery() || loadSelectedRegion();
  if (!selectedRegion.value) {
    redirecting.value = true;
    goLocationPicker();
    return;
  }
  await loadHome();
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
.overview-section {
  margin-bottom: 14px;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
}
.overview-grid :deep(.summary-card) {
  height: 100%;
  margin-bottom: 0;
  box-sizing: border-box;
}
@media (max-width: 359px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
