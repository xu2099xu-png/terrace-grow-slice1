<template>
  <div class="home">
    <van-nav-bar title="露台种植" fixed />
    <div class="content">
      <h1>开始你的露台种植</h1>
      <p>选择作物，测光照 → 查看适合度、品种、容器与配土方案</p>
      <div v-if="terraceLoaded && !hasTerrace" class="setup-callout">
        <span>先创建露台档案，才能生成适合你的多年生方案</span>
        <van-button size="small" type="primary" round @click="router.push('/terrace')">
          创建露台档案
        </van-button>
      </div>

      <!-- 季节入口（Slice 3） -->
      <van-cell-group inset class="seasonal-entry">
        <van-cell title="这个季节种什么" label="根据地区、当前日期和近期天气推荐可种作物" is-link @click="goSeasonal">
          <template #icon><van-icon name="calendar-o" class="entry-icon" /></template>
        </van-cell>
      </van-cell-group>

      <div class="crop-grid">
        <button
          v-for="crop in perennialCrops"
          :key="crop.id"
          class="crop-card"
          type="button"
          :disabled="!terraceLoaded"
          :aria-disabled="!terraceLoaded"
          :aria-label="`${crop.name}：${commandText}`"
          @click="goPlan(crop.id)"
        >
          <span>
            <strong>{{ crop.name }}</strong>
            <small>{{ crop.desc }}</small>
          </span>
          <span class="crop-command" :class="`crop-command--${crop.theme}`">
            {{ commandText }}
          </span>
        </button>
      </div>
    </div>

    <!-- 定位失败 → 数据驱动城市选择（AC-02/AC-30） -->
    <van-popup v-model:show="showCityPicker" position="bottom" round>
      <van-nav-bar title="选择城市" />
      <div class="city-list">
        <van-cell
          v-for="c in cities"
          :key="c.city_code"
          :title="c.city_name"
          is-link
          @click="pickCity(c.city_code)"
        />
        <van-empty v-if="!cities.length" description="暂无可选城市" />
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

const router = useRouter();
const showCityPicker = ref(false);
const cities = ref<{ city_code: string; city_name: string }[]>([]);
const terraceLoaded = ref(false);
const hasTerrace = ref(false);
const perennialCrops = [
  { id: 'crop-blueberry', name: '蓝莓', desc: '多年生浆果，喜酸性土壤', theme: 'blue' },
  { id: 'crop-grape', name: '葡萄', desc: '多年生藤本，适合露台盆栽搭架', theme: 'green' },
] as const;
const commandText = computed(() => {
  if (!terraceLoaded.value) return '检查中';
  return hasTerrace.value ? '查看方案' : '先建档';
});

function goPlan(cropId: string) {
  if (!terraceLoaded.value) return;
  if (!hasTerrace.value) {
    router.push(`/terrace?target_crop_id=${encodeURIComponent(cropId)}`);
    return;
  }
  router.push(`/plan/${cropId}`);
}

async function goSeasonal() {
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
    });
    const res = await api.post('/location/resolve', {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    if (res.data?.city_code) {
      router.push(`/seasons/now?city_code=${res.data.city_code}`);
      return;
    }
  } catch (e) {
    // geolocation unavailable / resolve failed → manual city pick (AC-02)
  }
  openCityPicker();
}

async function openCityPicker() {
  showCityPicker.value = true;
  if (!cities.value.length) {
    try {
      const res = await api.get('/location/supported-cities');
      cities.value = res.data;
    } catch (e) {
      showToast('城市列表加载失败');
    }
  }
}

function pickCity(cityCode: string) {
  showCityPicker.value = false;
  router.push(`/seasons/now?city_code=${cityCode}`);
}

async function loadTerrace() {
  try {
    const res = await api.get('/terraces/mine');
    hasTerrace.value = !!res.data;
  } catch (e) {
    hasTerrace.value = false;
  } finally {
    terraceLoaded.value = true;
  }
}

onMounted(loadTerrace);
</script>

<style scoped>
.home {
  padding-top: 46px;
}
.content {
  padding: 24px 16px;
  text-align: center;
}
h1 {
  font-size: 24px;
  margin-bottom: 8px;
}
p {
  color: #666;
  margin-bottom: 24px;
}
.seasonal-entry {
  margin-bottom: 24px;
  text-align: left;
}
.setup-callout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  background: #fff7e6;
  color: #8a5a00;
  border-radius: 8px;
  padding: 12px;
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.4;
}
.setup-callout span {
  flex: 1;
}
.entry-icon {
  font-size: 18px;
  margin-right: 4px;
  color: #1989fa;
}
.crop-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}
.crop-card {
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: #fff;
  padding: 16px;
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}
.crop-card:active {
  background: #f7f8fa;
}
.crop-card:disabled {
  opacity: 0.72;
  cursor: wait;
}
.crop-card strong {
  display: block;
  color: #323233;
  font-size: 17px;
  line-height: 1.3;
}
.crop-card small {
  display: block;
  margin-top: 6px;
  color: #969799;
  font-size: 13px;
  line-height: 1.4;
}
.crop-command {
  flex: 0 0 auto;
  min-width: 72px;
  border-radius: 999px;
  padding: 7px 12px;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  text-align: center;
  font-weight: 600;
}
.crop-command--blue {
  background: #1989fa;
}
.crop-command--green {
  background: #07c160;
}
.city-list {
  max-height: 60vh;
  overflow-y: auto;
}
</style>
