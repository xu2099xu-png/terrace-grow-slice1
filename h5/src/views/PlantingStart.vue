<template>
  <div class="planting-start">
    <van-nav-bar title="开始种植" fixed left-arrow @click-left="goBack" />

    <div class="content" v-if="!loading">
      <h2>确认开始种植</h2>
      <van-cell-group inset>
        <van-cell title="作物" :value="cropName" />
        <van-cell title="品种" :value="varietyLabel" />
        <van-cell title="容器" :value="containerName" />
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
        <van-button type="success" block round :disabled="!startDate" @click="submit">
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

const cropName = ref('葡萄');
const containerName = ref('—');
const varietyLabel = computed(() => (varietyId ? '指定品种' : '品种暂不确定（按通用流程）'));

const today = new Date();
const minDate = new Date(today.getFullYear() - 1, 0, 1);
const maxDate = new Date(today.getFullYear() + 1, 11, 31);
const startDate = ref(formatDate(today));
const showPicker = ref(false);
const loading = ref(true);

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
  loading.value = true;
  try {
    // fetch current terrace (single active profile)
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
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const crops = await api.get('/crops');
    const found = crops.data.find((c: any) => c.id === cropId);
    cropName.value = found?.name || cropName.value;
  } catch (e) {
    // non-fatal
  }
  try {
    const plan = await api.post('/recommendations/perennial', {
      crop_id: cropId,
      selected_container_type_id: containerTypeId,
      selected_variety_id: varietyId || undefined,
    });
    containerName.value = plan.data?.container?.selected_type_id
      ? containerLabel(plan.data)
      : '—';
  } catch (e) {
    // non-fatal: user can still start with known container/crop
  } finally {
    loading.value = false;
  }
});

function containerLabel(plan: any): string {
  const types = [...(plan.container?.preferredTypes || []), ...(plan.container?.acceptableTypes || [])];
  return types.find((t: any) => t.id === plan.container.selected_type_id)?.name || '—';
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
</style>
