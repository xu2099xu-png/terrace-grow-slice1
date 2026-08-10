<template>
  <div class="mine">
    <van-nav-bar title="我的" fixed />
    <div v-if="loading" class="state">
      <van-loading type="spinner" color="#1989fa" />
      <p>加载中…</p>
    </div>

    <div v-else-if="error" class="state">
      <p>{{ error }}</p>
      <van-button round type="primary" @click="load">重试</van-button>
    </div>

    <div v-else class="content">
      <ProfileSummary
        :profile="profile"
        :sun-info="sunInfo"
        @edit="openTerraceProfile"
        @create="openTerraceProfile"
      />

      <MaterialInventory
        :materials="materials"
        :selected-material-ids="selectedMaterialIds"
        :saving="savingMaterials"
        :message="saveMessage"
        @toggle="toggleMaterial"
        @save="saveMaterials"
      />

      <PlantingCards :plantings="plantings" @open="openPlanting" />

      <div class="actions">
        <van-button type="primary" block round @click="router.push('/seasonal')">下一步：查看时令种植</van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';
import ProfileSummary from '../components/profile/ProfileSummary.vue';
import MaterialInventory from '../components/profile/MaterialInventory.vue';
import PlantingCards from '../components/profile/PlantingCards.vue';

const router = useRouter();
const profile = ref<any>(null);
const plantings = ref<any[]>([]);
const materials = ref<any[]>([]);
const selectedMaterialIds = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const savingMaterials = ref(false);
const saveMessage = ref('');

const sunInfo = computed(() => {
  if (!profile.value) return '—';
  const min = profile.value.sunHoursMin;
  const max = profile.value.sunHoursMax;
  if (typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max)) {
    return '—';
  }
  const confidenceLabels: Record<string, string> = {
    low: '（不确定）',
    medium: '（较确定）',
  };
  const conf = confidenceLabels[profile.value.sunConfidence] || '';
  return `${min}–${max}h${conf}`;
});

function toggleMaterial(materialId: string) {
  if (selectedMaterialIds.value.includes(materialId)) {
    selectedMaterialIds.value = selectedMaterialIds.value.filter((id) => id !== materialId);
  } else {
    selectedMaterialIds.value = [...selectedMaterialIds.value, materialId];
  }
  saveMessage.value = '';
}

function openTerraceProfile() {
  router.push('/terrace?return_to=mine');
}

function openPlanting(plantingId: string) {
  router.push(`/plantings/${plantingId}`);
}

async function loadProfile() {
  try {
    const res = await api.get('/terraces/mine');
    profile.value = res.data;
  } catch (e: any) {
    if (e.response?.status === 404) {
      profile.value = null;
      return;
    }
    throw e;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  saveMessage.value = '';
  try {
    await loadProfile();
    const [plantingRes, materialRes, mineMaterialRes] = await Promise.all([
      api.get('/users/me/plantings'),
      api.get('/materials'),
      api.get('/materials/mine'),
    ]);
    plantings.value = plantingRes.data;
    materials.value = materialRes.data;
    selectedMaterialIds.value = mineMaterialRes.data.map((item: any) => item.materialId);
  } catch (e: any) {
    error.value = e.response?.data?.message || '加载失败，请重试';
  } finally {
    loading.value = false;
  }
}

async function saveMaterials() {
  savingMaterials.value = true;
  saveMessage.value = '';
  try {
    await api.put('/users/me/materials', { material_ids: selectedMaterialIds.value });
    const mineMaterialRes = await api.get('/materials/mine');
    selectedMaterialIds.value = mineMaterialRes.data.map((item: any) => item.materialId);
    saveMessage.value = '已保存';
  } catch (e: any) {
    saveMessage.value = e.response?.data?.message || '保存失败，请重试';
  } finally {
    savingMaterials.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.mine {
  padding-top: 46px;
  min-height: 100vh;
  box-sizing: border-box;
  background: #f7f8fa;
}
.content {
  padding: 16px;
}
.state {
  text-align: center;
  padding: 120px 16px 0;
  color: #646566;
}
.actions {
  margin-top: 24px;
}
</style>
