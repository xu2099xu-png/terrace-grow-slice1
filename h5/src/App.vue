<template>
  <div class="app-wrapper" :class="{ 'app-wrapper--tabbar': showTabbar && !booting && !bootError }">
    <div v-if="booting" class="app-state">
      <van-loading type="spinner" color="#1989fa" />
      <p>正在准备身份…</p>
    </div>
    <div v-else-if="bootError" class="app-state">
      <van-empty description="初始化失败，请重试" />
      <van-button type="primary" round @click="bootstrap">重试</van-button>
    </div>
    <template v-else>
      <router-view />
      <van-tabbar v-if="showTabbar" v-model="activeTab" route safe-area-inset-bottom>
        <van-tabbar-item replace to="/" icon="home-o">首页</van-tabbar-item>
        <van-tabbar-item replace to="/mine" icon="user-o">我的</van-tabbar-item>
      </van-tabbar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ensureIdentity } from './api/identity';

const route = useRoute();
const activeTab = ref(0);
const booting = ref(true);
const bootError = ref(false);

const showTabbar = computed(() => {
  return ['/', '/mine'].includes(route.path);
});

async function bootstrap() {
  booting.value = true;
  bootError.value = false;
  try {
    await ensureIdentity();
  } catch (e) {
    bootError.value = true;
  } finally {
    booting.value = false;
  }
}

onMounted(bootstrap);
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  background: #f7f8fa;
}
.app-wrapper {
  min-height: 100%;
  box-sizing: border-box;
}
.app-wrapper--tabbar {
  padding-bottom: calc(56px + env(safe-area-inset-bottom));
}
.app-state {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  box-sizing: border-box;
}
.app-state p {
  margin: 0;
  color: #646566;
}
</style>
