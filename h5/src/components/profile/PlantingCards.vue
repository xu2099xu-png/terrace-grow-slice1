<template>
  <van-cell-group inset title="我的种植" class="profile-section">
    <van-cell v-if="!plantings.length" title="暂无种植记录" />
    <van-cell
      v-for="planting in plantings"
      :key="planting.planting_id"
      :title="planting.crop_name + (planting.variety_name ? ' / ' + planting.variety_name : '')"
      :label="plantingLabel(planting)"
      is-link
      @click="$emit('open', planting.planting_id)"
    />
  </van-cell-group>
</template>

<script setup lang="ts">
defineProps<{
  plantings: any[];
}>();

defineEmits<{
  open: [plantingId: string];
}>();

function plantingLabel(planting: any): string {
  const statusMap: Record<string, string> = {
    planned: '计划中',
    active: '进行中',
    established: '已定植完成',
    lifecycle_unavailable: '流程暂不可用',
  };
  const stage = planting.current_stage_name ? `当前阶段：${planting.current_stage_name} · ` : '';
  return `${stage}开始于 ${planting.start_date} · ${statusMap[planting.status] || planting.status}`;
}
</script>

<style scoped>
.profile-section {
  margin-top: 14px;
}
</style>
