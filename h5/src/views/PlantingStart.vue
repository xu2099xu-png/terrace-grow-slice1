<template>
  <div class="planting-start">
    <van-nav-bar title="开始种植" fixed left-arrow @click-left="goBack" />

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>加载中…</p>
    </div>

    <div v-else-if="loadError" class="content">
      <van-empty description="数据加载失败，请返回重试" />
      <div class="actions">
        <van-button block round @click="goBack">返回</van-button>
        <van-button type="primary" block round @click="load">重试</van-button>
      </div>
    </div>

    <div class="content" v-else>
      <h2>确认开始种植</h2>
      <van-cell-group inset>
        <van-cell title="作物" :value="cropName || '—'" />
        <van-cell title="品种" :value="varietyName || '—'" />
        <van-cell title="容器" :value="containerName || '—'" />
      </van-cell-group>

      <van-cell-group inset title="开始日期">
        <van-field
          :model-value="startDate"
          label="日期"
          placeholder="选择开始日期"
          readonly
          @click="showPicker = true"
        />
      </van-cell-group>

      <div class="actions">
        <van-button
          type="success"
          block
          round
          :loading="submitting"
          :disabled="!canSubmit || submitting"
          @click="submit"
        >
          确认开始种植
        </van-button>
      </div>
    </div>

    <van-popup v-model:show="showPicker" position="bottom">
      <van-date-picker
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="onDateConfirm"
        @cancel="showPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

const router = useRouter();
const route = useRoute();

const cropId = String(route.query.crop_id || '');
const varietyId = (route.query.variety_id as string) || null;
const containerTypeId = String(route.query.container_type_id || '');

const cropName = ref('');
const varietyName = ref('');
const containerName = ref('');
const loadError = ref(false);

const today = new Date();
const minDate = new Date(today.getFullYear() - 1, 0, 1);
const maxDate = new Date(today.getFullYear() + 1, 11, 31);
const startDate = ref(formatDate(today));
const showPicker = ref(false);
const loading = ref(true);
const submitting = ref(false);

const canSubmit = computed(() => !!cropName.value && !!containerName.value && !!startDate.value);

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function onDateConfirm({ selectedValues }: any) {
  startDate.value = selectedValues.join('-');
  showPicker.value = false;
}

function goBack() {
  router.back();
}

async function submit() {
  if (submitting.value) return;
  if (!canSubmit.value) {
    showToast('数据未就绪，请稍后重试');
    return;
  }
  submitting.value = true;
  try {
    const mine = await api.get('/terraces/mine');
    const terrace = mine.data;
    if (!terrace) {
      showToast('请先创建露台档案');
      router.push('/terrace');
      return;
    }
    const clientRequestId = 'h5-' + crypto.randomUUID();
    const res = await api.post('/plantings', {
      terrace_id: terrace.id,
      crop_id: cropId,
      variety_id: varietyId,
      container_type_id: containerTypeId,
      start_date: startDate.value,
      client_request_id: clientRequestId,
    });
    const plantingId = res.data.planting.id;
    showToast('已开始种植');
    router.replace(`/plantings/${plantingId}`);
  } catch (e: any) {
    showToast(e.response?.data?.message || '开始种植失败');
  } finally {
    submitting.value = false;
  }
}

async function load() {
  loading.value = true;
  loadError.value = false;
  cropName.value = '';
  varietyName.value = '';
  containerName.value = '';
  try {
    const [cropsRes, planRes] = await Promise.all([
      api.get('/crops?life_type=perennial'),
      api.post('/recommendations/perennial', {
        crop_id: cropId,
        selected_container_type_id: containerTypeId,
        selected_variety_id: varietyId || undefined,
      }),
    ]);
    const crop = cropsRes.data.find((c: any) => c.id === cropId);
    cropName.value = crop?.name || '';

    const plan = planRes.data;
    const selectedVarietyId = plan?.selected_variety_id;
    if (selectedVarietyId) {
      const varieties = crop?.varieties || [];
      const v = varieties.find((x: any) => x.id === selectedVarietyId);
      varietyName.value = v?.name || '';
    } else {
      varietyName.value = '品种暂不确定（按通用流程）';
    }

    containerName.value = plan?.container?.selected_type_id
      ? containerLabel(plan)
      : '';

    if (!cropName.value || !containerName.value) {
      loadError.value = true;
    }
  } catch (e) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function containerLabel(plan: any): string {
  const types = [...(plan.container?.preferredTypes || []), ...(plan.container?.acceptableTypes || [])];
  return types.find((t: any) => t.id === plan.container.selected_type_id)?.name || '';
}
</script>

<style scoped>
.planting-start {
  padding-top: 46px;
}
.content {
  padding: 16px;
}
.actions {
  margin-top: 24px;
}
.actions > * + * {
  margin-top: 12px;
}
.loading {
  text-align: center;
  padding-top: 120px;
}
</style>
