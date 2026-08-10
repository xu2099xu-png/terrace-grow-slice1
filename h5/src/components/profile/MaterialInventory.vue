<template>
  <van-cell-group inset title="我的材料" class="profile-section">
    <div v-if="!materials.length" class="inline-empty">暂无可选材料</div>
    <van-checkbox-group v-else :model-value="selectedMaterialIds">
      <van-cell
        v-for="material in materials"
        :key="material.id"
        :title="material.name"
        :label="materialLabel(material)"
        clickable
        role="button"
        tabindex="0"
        :aria-label="materialToggleLabel(material)"
        data-testid="material-row"
        @click="$emit('toggle', material.id)"
        @keydown.enter.prevent="$emit('toggle', material.id)"
        @keydown.space.prevent="$emit('toggle', material.id)"
      >
        <template #right-icon>
          <van-checkbox :name="material.id" @click.stop="$emit('toggle', material.id)" />
        </template>
      </van-cell>
    </van-checkbox-group>
    <div class="save-row">
      <van-button
        size="small"
        round
        type="primary"
        :loading="saving"
        :disabled="saving"
        @click="$emit('save')"
      >
        保存材料
      </van-button>
      <span v-if="message" class="save-message">{{ message }}</span>
    </div>
  </van-cell-group>
</template>

<script setup lang="ts">
const props = defineProps<{
  materials: any[];
  selectedMaterialIds: string[];
  saving: boolean;
  message: string;
}>();

defineEmits<{
  toggle: [materialId: string];
  save: [];
}>();

function materialLabel(material: any): string | undefined {
  const groupLabel: Record<string, string> = {
    base: '基础基质',
    drainage: '排水透气',
    organic: '有机改良',
    retention: '保水材料',
    mineral: '矿物材料',
    fertilizer: '养分补充',
  };
  const parts = [
    groupLabel[material.functionGroup] || material.functionGroup,
    material.acidifying ? '酸性材料' : '',
  ].filter(Boolean);
  return parts.join(' · ') || undefined;
}

function materialToggleLabel(material: any): string {
  const selected = props.selectedMaterialIds.includes(material.id);
  return `${selected ? '取消选择' : '选择'}${material.name}`;
}
</script>

<style scoped>
.profile-section {
  margin-top: 14px;
}
.inline-empty {
  padding: 16px;
  color: #969799;
  font-size: 14px;
  text-align: center;
}
.save-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px 14px;
}
.save-message {
  color: #646566;
  font-size: 13px;
}
</style>
