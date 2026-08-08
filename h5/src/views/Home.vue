<template>
  <div class="home">
    <van-nav-bar title="露台种植" fixed />
    <div class="content">
      <h1>从露台种蓝莓开始</h1>
      <p>三步走：测光照 → 选品种 → 配土上盆</p>
      <van-button type="primary" block round @click="start">开始</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();

function start() {
  router.push('/terrace');
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
  margin-bottom: 32px;
}
</style>
