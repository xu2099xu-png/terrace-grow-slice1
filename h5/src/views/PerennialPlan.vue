<template>
  <div class="plan">
    <van-nav-bar title="种植方案" fixed left-arrow @click-left="router.push('/')" />

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>生成方案中…</p>
    </div>

    <div v-else-if="plan" class="content">
      <!-- 适配性 -->
      <van-cell-group inset title="适配性评估">
        <van-cell>
          <template #title>
            <strong :class="suitabilityClass">{{ suitabilityLabel }}</strong>
          </template>
          <template #label>
            日照：{{ plan.sunlight_status.hours_range[0] }}–{{ plan.sunlight_status.hours_range[1] }}h
            （{{ plan.sunlight_status.confidence === 'low' ? '不确定' : '较确定' }}）
          </template>
        </van-cell>
        <van-cell v-if="plan.warnings.length" title="⚠️ 注意">
          <template #label>
            <p v-for="w in plan.warnings" :key="w" class="warning">{{ w }}</p>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 推荐品种 -->
      <van-cell-group inset title="推荐品种">
        <van-cell v-for="v in plan.recommended_varieties" :key="v.varietyId">
          <template #title>
            {{ v.name }} <van-tag v-if="v.varietyId === plan.selected_variety_id" type="primary">已选</van-tag>
          </template>
          <template #label>
            需冷量: {{ v.chill_hours_min }}h · 耐热: {{ v.heat_tolerance }} · 耐阴: {{ v.shade_tolerance }}
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 授粉 -->
      <van-cell-group inset title="授粉" v-if="plan.pollination">
        <van-cell title="需异株授粉" :value="plan.pollination.need_two ? '是' : '否'" />
        <van-cell v-if="plan.pollination.recommended_partners.length" title="推荐搭档">
          <template #label>
            <p v-for="p in plan.pollination.recommended_partners" :key="p.id">{{ p.name }}</p>
          </template>
        </van-cell>
        <van-cell v-if="plan.pollination.note" :title="plan.pollination.note" />
      </van-cell-group>

      <!-- 容器 -->
      <van-cell-group inset title="容器建议">
        <van-cell title="首选类型" :value="containerLabel" />
        <van-cell title="建议容积" :value="containerVolume" />
        <van-cell title="换盆周期" :value="plan.container?.repotNote || '—'" />
      </van-cell-group>

      <!-- 配土 -->
      <van-cell-group inset title="配土方案">
        <van-cell v-if="plan.soil_mix">
          <template #title>
            <strong>{{ plan.soil_mix.feasibility }}</strong>
          </template>
          <template #label>
            <p v-if="plan.soil_mix.mix.length">配比：</p>
            <p v-for="m in plan.soil_mix.mix" :key="m.material">{{ m.material }} {{ m.pct }}%</p>
            <p v-if="plan.soil_mix.substitutions_applied.length" class="sub">替代：{{ plan.soil_mix.substitutions_applied.map(s => `${s.from}→${s.to}`).join('、') }}</p>
            <p v-if="plan.soil_mix.need_acidification">需要额外调酸</p>
            <p v-if="plan.soil_mix.ph_management_note" class="sub">{{ plan.soil_mix.ph_management_note }}</p>
          </template>
        </van-cell>
        <van-cell v-if="plan.missing_materials.length" title="还缺材料">
          <template #label>
            <span v-for="m in plan.missing_materials" :key="m.material" class="missing">{{ m.material }} </span>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 浇水风险 -->
      <van-cell-group inset title="浇水风险" v-if="plan.water_risk">
        <van-cell title="风险等级" :value="plan.water_risk.level" />
        <van-cell v-if="plan.water_risk.mitigation.length" title="缓解建议">
          <template #label>
            <p v-for="m in plan.water_risk.mitigation" :key="m">· {{ m }}</p>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 下一步 -->
      <van-cell-group inset title="下一步">
        <van-cell :title="plan.next_action" />
      </van-cell-group>

      <!-- 材料调整 -->
      <div class="actions">
        <van-button type="primary" block round @click="showMaterials = true">查看/调整我的材料</van-button>
      </div>

      <!-- 材料弹窗 -->
      <van-dialog
        v-model:show="showMaterials"
        title="我的材料"
        show-cancel-button
        @confirm="recalculateSoil"
      >
        <van-checkbox-group v-model="selectedMaterials">
          <van-cell-group>
            <van-cell v-for="m in materials" :key="m.id" :title="m.name">
              <template #right-icon>
                <van-checkbox :name="m.id" />
              </template>
            </van-cell>
          </van-cell-group>
        </van-checkbox-group>
      </van-dialog>
    </div>

    <div v-else-if="error" class="error">
      <p>获取方案失败，请返回重试</p>
      <van-button block round @click="load">重试</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';

const router = useRouter();
const props = defineProps<{ cropId: string }>();

const loading = ref(false);
const plan = ref<any>(null);
const error = ref(false);
const showMaterials = ref(false);
const materials = ref<any[]>([]);
const selectedMaterials = ref<string[]>([]);

const suitabilityLabel = computed(() => {
  const map: Record<string, string> = {
    suitable: '适合种植',
    borderline: '日照稍弱，可尝试',
    likely_unsuitable: '可能不适合，建议确认日照',
    unsuitable: '日照不足，不建议',
  };
  return map[plan.value?.suitability] || '—';
});

const suitabilityClass = computed(() => {
  const s = plan.value?.suitability;
  if (s === 'suitable') return 'good';
  if (s === 'borderline') return 'warn';
  return 'bad';
});

const containerLabel = computed(() => {
  const c = plan.value?.container;
  if (!c) return '—';
  const names = c.preferredTypes?.map((t: any) => t.name).join('、') || '';
  return names || '—';
});

const containerVolume = computed(() => {
  const c = plan.value?.container;
  if (!c) return '—';
  const min = c.volumeRange?.[0] ?? c.minVolumeL;
  const max = c.volumeRange?.[1];
  return max ? `${min}–${max}L` : `≥${min}L`;
});

async function load() {
  loading.value = true;
  error.value = false;
  try {
    const res = await api.post('/recommendations/perennial', { crop_id: props.cropId });
    plan.value = res.data;

    // fetch materials for dialog
    const matRes = await api.get('/materials');
    materials.value = matRes.data;
    const mineRes = await api.get('/materials/mine');
    selectedMaterials.value = mineRes.data.map((m: any) => m.materialId);
  } catch (e) {
    error.value = true;
  } finally {
    loading.value = false;
  }
}

async function recalculateSoil() {
  try {
    await api.put('/users/me/materials', { material_ids: selectedMaterials.value });
    const res = await api.post('/soil/calculate', {
      crop_id: props.cropId,
      container_type_id: plan.value?.container?.selected_type_id,
      material_ids: selectedMaterials.value,
    });
    plan.value.soil_mix = res.data.soil;
    plan.value.missing_materials = res.data.soil?.missing || [];
    plan.value.water_risk = res.data.water_risk;
    showToast('已更新配土方案');
  } catch (e: any) {
    showToast('更新失败');
  }
}

onMounted(load);
</script>

<style scoped>
.plan {
  padding-top: 46px;
  padding-bottom: 24px;
}
.content > * {
  margin-bottom: 12px;
}
.loading, .error {
  text-align: center;
  padding-top: 120px;
}
.good { color: #07c160; }
.warn { color: #ff976a; }
.bad { color: #ee0a24; }
.warning { color: #ee0a24; margin: 4px 0; }
.missing { color: #ee0a24; margin-right: 8px; }
.sub { color: #ff976a; margin-top: 4px; }
.actions {
  padding: 16px;
}
</style>
