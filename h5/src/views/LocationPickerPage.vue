<template>
  <div class="location-picker-page">
    <van-nav-bar title="选择区县" fixed left-arrow @click-left="goReturn" />
    <div class="content">
      <section class="hero">
        <span>地区选择</span>
        <h1>选择用于时令推荐的区县</h1>
        <p>可使用浏览器定位，也可从热门地区或省市区逐级选择。</p>
      </section>

      <section v-if="selectedRegion" class="current-card">
        <span>当前选择</span>
        <strong>{{ selectedRegion.province_name }} · {{ selectedRegion.city_name }} · {{ selectedRegion.name }}</strong>
      </section>

      <section class="locate-card">
        <div>
          <span class="eyebrow">浏览器定位</span>
          <strong>{{ locateTitle }}</strong>
          <p>{{ locateMessage }}</p>
        </div>
        <van-button
          size="small"
          round
          type="primary"
          :loading="locateState === 'locating'"
          @click="requestLocation"
        >
          重新定位
        </van-button>
      </section>

      <RegionPicker :selected-region="selectedRegion" @select="selectRegion" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RegionPicker from '../components/RegionPicker.vue';
import {
  loadSelectedRegion,
  resolveLocation,
  saveSelectedRegion,
  toSelectedRegionMetadata,
  type SelectedRegionMetadata,
} from '../api/region-selection';

type LocateState = 'idle' | 'locating' | 'success' | 'denied' | 'failed' | 'unsupported';

const router = useRouter();
const route = useRoute();
const selectedRegion = ref<SelectedRegionMetadata | null>(null);
const locateState = ref<LocateState>('idle');

const locateTitle = computed(() => {
  return {
    idle: '可尝试自动定位',
    locating: '定位中',
    success: '已定位到区县',
    denied: '未授权定位',
    failed: '定位失败',
    unsupported: '当前环境不可定位',
  }[locateState.value];
});

const locateMessage = computed(() => {
  return {
    idle: '定位只用于请求服务端解析区县，不在本地保存精确坐标。',
    locating: '正在请求浏览器定位并解析区县…',
    success: '已保存区县选择，正在返回。',
    denied: '浏览器未授权定位，请手动选择区县。',
    failed: '定位或区县解析未完成，请手动选择区县。',
    unsupported: '非安全上下文或浏览器不支持定位，请手动选择区县。',
  }[locateState.value];
});

function safeReturnTo(): string {
  const value = route.query.return_to;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '/';
  return raw;
}

function canUseGeolocation(): boolean {
  const host = window.location.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1' || host === '';
  return (window.isSecureContext || isLocalDev) && !!navigator.geolocation;
}

function goReturn() {
  router.replace(safeReturnTo());
}

async function requestLocation() {
  if (!canUseGeolocation()) {
    locateState.value = 'unsupported';
    return;
  }
  locateState.value = 'locating';
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 });
    });
    const resolved = await resolveLocation(pos.coords.latitude, pos.coords.longitude);
    if (!resolved) {
      locateState.value = 'failed';
      return;
    }
    const metadata = toSelectedRegionMetadata(resolved);
    saveSelectedRegion(metadata);
    selectedRegion.value = metadata;
    locateState.value = 'success';
    goReturn();
  } catch (e: any) {
    locateState.value = e?.code === 1 ? 'denied' : 'failed';
  }
}

function selectRegion(region: SelectedRegionMetadata) {
  saveSelectedRegion(region);
  selectedRegion.value = region;
  goReturn();
}

onMounted(() => {
  selectedRegion.value = loadSelectedRegion();
  if (!selectedRegion.value) {
    requestLocation();
  }
});
</script>

<style scoped>
.location-picker-page {
  min-height: 100vh;
  padding-top: 46px;
  background: #f5f7f4;
}
.content {
  padding: 14px 16px 20px;
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
.hero h1 {
  margin: 4px 0;
  color: #1f2d24;
  font-size: 22px;
  line-height: 1.25;
}
.hero p,
.locate-card p {
  margin: 0;
  color: #646566;
  font-size: 14px;
  line-height: 1.5;
}
.current-card,
.locate-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(31, 45, 36, 0.06);
}
.current-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: #1f7a3a;
}
.current-card span {
  font-size: 12px;
  color: #6b8f77;
}
.current-card strong {
  font-size: 14px;
  line-height: 1.35;
}
.locate-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.locate-card strong {
  display: block;
  margin: 3px 0;
  color: #1f2d24;
  font-size: 16px;
}
</style>
