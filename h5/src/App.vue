<template>
  <div class="app-wrapper">
    <router-view />
    <van-tabbar v-if="showTabbar" v-model="activeTab" route safe-area-inset-bottom>
      <van-tabbar-item replace to="/" icon="home-o">首页</van-tabbar-item>
      <van-tabbar-item replace to="/plan/crop-blueberry" icon="flower-o">方案</van-tabbar-item>
      <van-tabbar-item replace to="/mine" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activeTab = ref(0);

const showTabbar = computed(() => {
  return ['/', '/plan/crop-blueberry', '/mine'].includes(route.path);
});
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  background: #f7f8fa;
}
.app-wrapper {
  min-height: 100%;
  padding-bottom: 50px;
}
</style>
