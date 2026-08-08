<template>
  <div class="home">
    <van-nav-bar title="露台种植" fixed />
    <div class="content">
      <h1>开始你的露台种植</h1>
      <p>选择作物，测光照 → 选品种 → 配土上盆 → 进入种植流程</p>

      <!-- 季节入口（Slice 3） -->
      <van-cell-group inset class="seasonal-entry">
        <van-cell title="这个季节种什么" label="根据地区、当前日期和近期天气推荐可种作物" is-link @click="goSeasonal">
          <template #icon><van-icon name="calendar-o" class="entry-icon" /></template>
        </van-cell>
      </van-cell-group>

      <div class="crop-grid">
        <van-card
          title="蓝莓"
          desc="多年生浆果，喜酸性土壤"
          @click="goPlan('crop-blueberry')"
        >
          <template #footer>
            <van-button size="small" type="primary" round>开始</van-button>
          </template>
        </van-card>

        <van-card
          title="葡萄"
          desc="多年生藤本，适合露台盆栽搭架"
          @click="goPlan('crop-grape')"
        >
          <template #footer>
            <van-button size="small" type="success" round>开始</van-button>
          </template>
        </van-card>
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

const router = useRouter();
const showCityPicker = ref(false);
const cities = ref<{ city_code: string; city_name: string }[]>([]);

function goPlan(cropId: string) {
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
</script>

<style scoped>
.home {
  padding-top: 46px;
}
.content {
  padding: 24px;
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
.entry-icon {
  font-size: 18px;
  margin-right: 4px;
  color: #1989fa;
}
.crop-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}
.city-list {
  max-height: 60vh;
  overflow-y: auto;
}
</style>
