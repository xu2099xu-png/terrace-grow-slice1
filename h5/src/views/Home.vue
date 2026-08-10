<template>
  <div class="home">
    <van-nav-bar title="长期种植" fixed />
    <div class="content">
      <h1>长期种植</h1>
      <p>选择多年生作物，测光照后查看适合度、品种、容器与配土方案</p>
      <div v-if="terraceLoaded && !hasTerrace" class="setup-callout">
        <span>先创建露台档案，才能生成适合你的多年生方案</span>
        <van-button size="small" type="primary" round @click="router.push('/terrace')">
          创建露台档案
        </van-button>
      </div>

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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api/client';

const router = useRouter();
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
</style>
