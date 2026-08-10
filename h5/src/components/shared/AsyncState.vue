<template>
  <div class="async-state" :class="{ 'async-state--inline': inline }">
    <van-loading v-if="loading" type="spinner" color="#2ba84a" />
    <p>{{ message }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
  loading?: boolean;
  inline?: boolean;
}>();
</script>

<style scoped>
.async-state {
  min-height: calc(100vh - 46px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #646566;
  text-align: center;
  padding: 24px;
  box-sizing: border-box;
}
.async-state--inline {
  min-height: 240px;
}
.async-state p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
</style>
