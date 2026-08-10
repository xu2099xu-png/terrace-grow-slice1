<template>
  <div
    class="app-wrapper app-wrapper--mobile-shell"
    :class="{ 'app-wrapper--tabbar': showTabbar && !booting && !bootError }"
  >
    <div v-if="booting" class="app-state">
      <van-loading type="spinner" color="#1989fa" />
      <p>正在准备身份…</p>
    </div>
    <div v-else-if="bootError" class="app-state">
      <van-empty description="初始化失败，请重试" />
      <van-button type="primary" round @click="bootstrap">重试</van-button>
    </div>
    <template v-else>
      <main class="app-main">
        <router-view />
      </main>
      <van-tabbar v-if="showTabbar" v-model="activeTab" route safe-area-inset-bottom>
        <van-tabbar-item replace to="/" icon="calendar-o">时令种植</van-tabbar-item>
        <van-tabbar-item replace to="/perennial" icon="flower-o">长期种植</van-tabbar-item>
        <van-tabbar-item replace to="/mine" icon="user-o">我的</van-tabbar-item>
      </van-tabbar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ensureIdentity } from './api/identity';

const route = useRoute();
const activeTab = ref(0);
const booting = ref(true);
const bootError = ref(false);

const showTabbar = computed(() => {
  return ['seasonal', 'perennial', 'mine'].includes(String(route.meta.tab || ''));
});

watch(
  () => route.meta.tab,
  (tab) => {
    activeTab.value = tab === 'perennial' ? 1 : tab === 'mine' ? 2 : 0;
  },
  { immediate: true },
);

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
  --app-mobile-max-width: 430px;
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
.app-main {
  width: 100%;
  max-width: var(--app-mobile-max-width);
  min-height: 100vh;
  margin: 0 auto;
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
@media (min-width: 431px) {
  .app-wrapper--mobile-shell .van-nav-bar.van-nav-bar--fixed,
  .app-wrapper--mobile-shell .van-tabbar.van-tabbar--fixed {
    left: 50% !important;
    right: auto !important;
    width: var(--app-mobile-max-width) !important;
    max-width: var(--app-mobile-max-width) !important;
    transform: translateX(-50%) !important;
  }
}
</style>
