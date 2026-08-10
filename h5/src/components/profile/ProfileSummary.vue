<template>
  <van-cell-group inset title="资料摘要">
    <template v-if="profile">
      <van-cell title="露台名称" :value="profile.name || '-'" />
      <van-cell title="所在区县" :value="regionText" />
      <van-cell title="日照估算" :value="sunInfo" />
      <van-cell title="气候区" :value="profile.climateZone || '-'" />
      <van-cell title="地区 / 档案" is-link role="button" @click="$emit('edit')" />
    </template>
    <van-empty v-else description="还没有露台档案">
      <van-button round type="primary" @click="$emit('create')">创建露台档案</van-button>
    </van-empty>
  </van-cell-group>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  profile: any | null;
  sunInfo: string;
}>();

defineEmits<{
  edit: [];
  create: [];
}>();

const regionText = computed(() => {
  const profile = props.profile;
  if (!profile) return '-';
  const province = profile.provinceName || profile.province_name || profile.region?.province_name;
  const city = profile.cityName || profile.city_name || profile.region?.city_name;
  const district = profile.regionName || profile.region_name || profile.region?.name;
  if (province && city && district) return `${province} · ${city} · ${district}`;
  return profile.cityCode || '-';
});
</script>
