<template>
  <div class="home">
    <van-nav-bar title="长期种植" fixed />
    <div class="content">
      <h1>长期种植</h1>
      <p>选择多年生作物，查看品种、环境要求与露台种植方案</p>
      <div v-if="terraceLoaded && !hasTerrace" class="setup-callout">
        <span>先创建露台档案，才能生成适合你的多年生方案</span>
        <van-button size="small" type="primary" round @click="router.push('/terrace')">
          创建露台档案
        </van-button>
      </div>

      <div v-if="cropLoading" class="state">
        <van-loading type="spinner" color="#1989fa" />
        <p>加载作物中…</p>
      </div>
      <div v-else-if="cropError" class="state">
        <van-empty description="作物列表加载失败" />
        <van-button round block @click="loadCrops">重试</van-button>
      </div>
      <van-empty v-else-if="perennialCrops.length === 0" description="暂无多年生作物" />
      <div v-else class="crop-grid">
        <PlantCard
          v-for="crop in perennialCrops"
          :key="crop.id"
          :crop="crop"
          :command="commandText"
          :disabled="!terraceLoaded"
          @select="goDetail(crop.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';
import { fetchCrops, type CropSummary } from '../api/catalog';
import PlantCard from '../components/plants/PlantCard.vue';

const router = useRouter();
const terraceLoaded = ref(false);
const terraceProfile = ref<any>(null);
const cropLoading = ref(false);
const cropError = ref(false);
const perennialCrops = ref<CropSummary[]>([]);

const hasTerrace = computed(() => !!terraceProfile.value);
const commandText = computed(() => (!terraceLoaded.value ? '检查中' : '查看详情'));

function terraceQuery(): Record<string, string> {
  const terrace = terraceProfile.value;
  if (!terrace) return {};
  const query: Record<string, string> = {};
  const adminCode = terrace.region?.admin_code || (!terrace.needsDistrictConfirmation ? terrace.regionAdminCode : '');
  if (adminCode) query.admin_code = String(adminCode);
  if (terrace.cityCode) query.city_code = String(terrace.cityCode);
  return query;
}

function goDetail(cropId: string) {
  if (!terraceLoaded.value) return;
  router.push({
    path: `/perennial/${cropId}`,
    query: terraceQuery(),
  });
}

async function loadTerrace() {
  try {
    const res = await api.get('/terraces/mine');
    terraceProfile.value = res.data || null;
  } catch (e) {
    terraceProfile.value = null;
  } finally {
    terraceLoaded.value = true;
  }
}

async function loadCrops() {
  cropLoading.value = true;
  cropError.value = false;
  try {
    perennialCrops.value = await fetchCrops('perennial');
  } catch (e) {
    perennialCrops.value = [];
    cropError.value = true;
  } finally {
    cropLoading.value = false;
  }
}

onMounted(() => {
  void loadCrops();
  void loadTerrace();
});
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
.state {
  padding: 36px 0;
}
.state p {
  margin: 10px 0 0;
}
.crop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  text-align: left;
}

@media (max-width: 420px) {
  .crop-grid {
    grid-template-columns: 1fr;
  }
}
</style>
