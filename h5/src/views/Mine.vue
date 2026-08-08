<template>
  <div class="mine">
    <van-nav-bar title="我的" fixed />
    <div class="content">
      <van-cell-group inset>
        <van-cell title="露台名称" :value="profile?.name || '—'" />
        <van-cell title="所在城市" :value="profile?.cityCode || '—'" />
        <van-cell title="日照估算" :value="sunInfo" />
        <van-cell title="气候区" :value="profile?.climateZone || '—'" />
      </van-cell-group>

      <van-cell-group inset title="我的种植">
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

onMounted(async () => {
  try {
    const res = await api.get('/terraces/mine');
    profile.value = res.data;
  } catch (e) {
    // ignore
  }
  try {
    const res = await api.get('/users/me/plantings');
    plantings.value = res.data;
  } catch (e) {
    // ignore
  }
});
</script>

<style scoped>
.mine {
  padding-top: 46px;
}
.content {
  padding: 16px;
}
.actions {
  margin-top: 24px;
}
</style>
