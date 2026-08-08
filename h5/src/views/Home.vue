<template>
  <div class="home">
    <van-nav-bar title="露台种植" fixed />
    <div class="content">
      <h1>开始你的露台种植</h1>
      <p>选择作物，测光照 → 选品种 → 配土上盆 → 进入种植流程</p>

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
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();

function goPlan(cropId: string) {
  router.push(`/plan/${cropId}`);
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
.crop-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}
</style>
