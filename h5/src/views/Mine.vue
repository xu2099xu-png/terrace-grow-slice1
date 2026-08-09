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
      <van-cell-group inset>
        <template v-if="profile">
          <van-cell title="露台名称" :value="profile.name || '—'" />
          <van-cell title="所在城市" :value="profile.cityCode || '—'" />
          <van-cell title="日照估算" :value="sunInfo" />
          <van-cell title="气候区" :value="profile.climateZone || '—'" />
          <van-cell title="编辑露台档案" is-link role="button" @click="router.push('/terrace?return_to=mine')" />
        </template>
        <van-empty v-else description="还没有露台档案">
          <van-button round type="primary" @click="router.push('/terrace?return_to=mine')">创建露台档案</van-button>
        </van-empty>
      </van-cell-group>

      <van-cell-group inset title="我的材料" class="section">
        <div v-if="!materials.length" class="inline-empty">暂无可选材料</div>
        <van-checkbox-group v-else v-model="selectedMaterialIds">
          <van-cell
            v-for="material in materials"
            :key="material.id"
            :title="material.name"
            :label="materialLabel(material)"
            clickable
            role="button"
            tabindex="0"
            :aria-label="materialToggleLabel(material)"
            data-testid="material-row"
            @click="toggleMaterial(material.id)"
            @keydown.enter.prevent="toggleMaterial(material.id)"
            @keydown.space.prevent="toggleMaterial(material.id)"
          >
            <template #right-icon>
              <van-checkbox :name="material.id" @click.stop />
            </template>
          </van-cell>
        </van-checkbox-group>
        <div class="save-row">
          <van-button
            size="small"
            round
            type="primary"
            :loading="savingMaterials"
            :disabled="savingMaterials"
            @click="saveMaterials"
          >
            保存材料
          </van-button>
          <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
        </div>
      </van-cell-group>

      <van-cell-group inset title="我的种植" class="section">
        <van-cell v-if="!plantings.length" title="暂无种植记录" />
        <van-cell
          v-for="p in plantings"
          :key="p.planting_id"
          :title="p.crop_name + (p.variety_name ? ' / ' + p.variety_name : '')"
          :label="plantingLabel(p)"
          is-link
          @click="router.push(`/plantings/${p.planting_id}`)"
        />
      </van-cell-group>

      <div class="actions">
        <van-button type="primary" block round @click="router.push('/')">返回首页</van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';

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
  const conf = profile.value.sunConfidence === 'low' ? '（不确定）' : '（较确定）';
  return `${min}–${max}h${conf}`;
});

function plantingLabel(p: any): string {
  const statusMap: Record<string, string> = {
    planned: '计划中',
    active: '进行中',
    established: '已定植完成',
    lifecycle_unavailable: '流程暂不可用',
  };
  const stage = p.current_stage_name ? `当前阶段：${p.current_stage_name} · ` : '';
  return `${stage}开始于 ${p.start_date} · ${statusMap[p.status] || p.status}`;
}

function materialLabel(material: any): string {
  const groupLabel: Record<string, string> = {
    base: '基础基质',
    drainage: '排水透气',
    organic: '有机改良',
    retention: '保水材料',
    mineral: '矿物材料',
    fertilizer: '养分补充',
  };
  const parts = [
    groupLabel[material.functionGroup] || material.functionGroup,
    material.acidifying ? '酸性材料' : '',
  ].filter(Boolean);
  return parts.join(' · ') || undefined;
}

function materialToggleLabel(material: any): string {
  const selected = selectedMaterialIds.value.includes(material.id);
  return `${selected ? '取消选择' : '选择'}${material.name}`;
}

function toggleMaterial(materialId: string) {
  if (selectedMaterialIds.value.includes(materialId)) {
    selectedMaterialIds.value = selectedMaterialIds.value.filter((id) => id !== materialId);
  } else {
    selectedMaterialIds.value = [...selectedMaterialIds.value, materialId];
  }
  saveMessage.value = '';
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
}
.content {
  padding: 16px;
}
.state {
  text-align: center;
  padding: 120px 16px 0;
  color: #666;
}
.section {
  margin-top: 14px;
}
.inline-empty {
  padding: 16px;
  color: #999;
  font-size: 14px;
  text-align: center;
}
.save-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 14px;
}
.save-message {
  color: #666;
  font-size: 13px;
}
.actions {
  margin-top: 24px;
}
</style>
