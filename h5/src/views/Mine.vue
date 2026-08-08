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

const sunInfo = computed(() => {
  if (!profile.value) return '—';
  const min = profile.value.sunHoursMin;
  const max = profile.value.sunHoursMax;
  const conf = profile.value.sunConfidence === 'low' ? '（不确定）' : '（较确定）';
  return `${min}–${max}h${conf}`;
});

onMounted(async () => {
  try {
    const res = await api.get('/terraces/mine');
    profile.value = res.data;
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
