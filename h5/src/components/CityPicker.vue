<template>
  <div class="city-picker" data-testid="city-picker">
    <div v-if="loading" class="state">
      <van-loading type="spinner" color="#1989fa" />
      <p>城市加载中…</p>
    </div>

    <div v-else-if="error" class="state">
      <p>{{ error }}</p>
      <van-button size="small" round type="primary" @click="load">重试</van-button>
    </div>

    <van-cell-group v-else inset>
      <van-cell
        v-for="city in cities"
        :key="city.city_code"
        :title="city.city_name"
        :label="city.city_code"
        clickable
        is-link
        role="button"
        tabindex="0"
        data-testid="city-option"
        @click="emit('select', city.city_code, city.city_name)"
        @keydown.enter.prevent="emit('select', city.city_code, city.city_name)"
        @keydown.space.prevent="emit('select', city.city_code, city.city_name)"
      />
      <van-empty v-if="!cities.length" description="暂无可选城市" />
    </van-cell-group>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import api from '../api/client';

interface SupportedCity {
  city_code: string;
  city_name: string;
}

const emit = defineEmits<{
  select: [cityCode: string, cityName: string];
}>();

const loading = ref(true);
const error = ref('');
const cities = ref<SupportedCity[]>([]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/location/supported-cities');
    cities.value = res.data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '城市列表加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.city-picker {
  padding: 8px 0;
}
.state {
  text-align: center;
  padding: 48px 16px;
  color: #666;
}
</style>
