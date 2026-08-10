<template>
  <div class="terrace-wizard">
    <van-nav-bar title="创建露台档案" fixed left-arrow @click-left="goBack" />

    <StepProgress :current="step" :items="steps" />

    <WizardStep
      v-if="step === 1"
      title="您所在的区县？"
      hint="用于匹配气候区与需冷量估算"
    >
      <RegionPicker :selected-region="selectedRegion" @select="selectRegion" />
      <template #actions>
        <van-button type="primary" block round @click="nextStep" :disabled="!selectedRegion">下一步</van-button>
      </template>
    </WizardStep>

    <WizardStep
      v-if="step === 2"
      title="露台日照情况？"
      hint="请选择最符合的一项"
    >
      <van-radio-group v-model="sunExposureLevel">
        <van-cell-group>
          <van-cell title="阳光充足（大部分白天都有阳光）" clickable @click="sunExposureLevel = 'LONG'">
            <template #right-icon>
              <van-radio name="LONG" />
            </template>
          </van-cell>
          <van-cell title="半天左右（上午或下午有阳光）" clickable @click="sunExposureLevel = 'MEDIUM'">
            <template #right-icon>
              <van-radio name="MEDIUM" />
            </template>
          </van-cell>
          <van-cell title="晒得较少（只有一小会儿）" clickable @click="sunExposureLevel = 'SHORT'">
            <template #right-icon>
              <van-radio name="SHORT" />
            </template>
          </van-cell>
          <van-cell title="基本晒不到" clickable @click="sunExposureLevel = 'LOW'">
            <template #right-icon>
              <van-radio name="LOW" />
            </template>
          </van-cell>
          <van-cell title="我不太确定" clickable @click="sunExposureLevel = 'UNSURE'">
            <template #right-icon>
              <van-radio name="UNSURE" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
      <template #actions>
        <van-button type="primary" block round @click="nextStep" :disabled="!sunExposureLevel">下一步</van-button>
      </template>
    </WizardStep>

    <WizardStep
      v-if="step === 3"
      title="朝向和日照时段？"
      hint="保留这两个观察项，便于日照不确定时估算"
    >
      <van-cell-group>
        <van-cell title="露台朝向">
          <template #label>
            <van-radio-group v-model="orientation" direction="horizontal">
              <van-radio name="south">南</van-radio>
              <van-radio name="east">东</van-radio>
              <van-radio name="west">西</van-radio>
              <van-radio name="north">北</van-radio>
              <van-radio name="unknown">不确定</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
        <van-cell title="主要日照时段">
          <template #label>
            <van-radio-group v-model="timeObs" direction="horizontal">
              <van-radio name="morning">上午</van-radio>
              <van-radio name="afternoon">下午</van-radio>
              <van-radio name="allday">全天</van-radio>
              <van-radio name="rarely">很少</van-radio>
              <van-radio name="unknown">不确定</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
      </van-cell-group>
      <template #actions>
        <van-button type="primary" block round @click="nextStep" :disabled="!orientation || !timeObs">下一步</van-button>
      </template>
    </WizardStep>

    <WizardStep
      v-if="step === 4"
      title="露台是否淋雨？"
      hint="直接影响积水风险评估，请如实选择"
    >
      <van-radio-group v-model="rainExposed">
        <van-cell-group>
          <van-cell title="会淋到雨" clickable @click="rainExposed = true">
            <template #right-icon>
              <van-radio :name="true" />
            </template>
          </van-cell>
          <van-cell title="基本淋不到" clickable @click="rainExposed = false">
            <template #right-icon>
              <van-radio :name="false" />
            </template>
          </van-cell>
        </van-cell-group>
      </van-radio-group>
      <template #actions>
        <van-button type="primary" block round @click="submit" :disabled="rainExposed === null">完成</van-button>
      </template>
    </WizardStep>

    <div v-if="loading" class="loading">
      <van-loading type="spinner" color="#1989fa" />
      <p>分析中…</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import api from '../api/client';
import RegionPicker from '../components/RegionPicker.vue';
import StepProgress from '../components/wizard/StepProgress.vue';
import WizardStep from '../components/wizard/WizardStep.vue';
import type { SelectedRegionMetadata } from '../api/region-selection';

const router = useRouter();
const route = useRoute();
const step = ref(1);
const cityCode = ref('');
const selectedRegion = ref<SelectedRegionMetadata | null>(null);
const sunExposureLevel = ref('');
const orientation = ref('');
const timeObs = ref('');
const rainExposed = ref<boolean | null>(null);
const loading = ref(false);
const steps = [
  { index: 1, label: '地区' },
  { index: 2, label: '光照' },
  { index: 3, label: '朝向/时段' },
  { index: 4, label: '避雨' },
];
const CANONICAL_CITY_CODES = new Set([
  'beijing',
  'tianjin',
  'shanghai',
  'hangzhou',
  'nanjing',
  'suzhou',
  'ningbo',
  'hefei',
  'wuxi',
  'guangzhou',
  'shenzhen',
  'fuzhou',
  'xiamen',
  'nanning',
  'shijiazhuang',
  'jinan',
  'zhengzhou',
]);
const SAFE_RETURN_PATHS: Record<string, string> = {
  mine: '/mine',
  profile: '/mine',
  seasonal: '/seasonal',
  perennial: '/perennial',
  '/mine': '/mine',
  '/profile': '/mine',
  '/seasonal': '/seasonal',
  '/perennial': '/perennial',
};

function queryString(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}

function safeAdminCode(value: unknown): string {
  const raw = queryString(value);
  return /^\d{6}$/.test(raw) ? raw : '';
}

function safeCityCode(value: unknown): string {
  const raw = queryString(value);
  return CANONICAL_CITY_CODES.has(raw) ? raw : '';
}

const targetCropId = computed(() => {
  const value = queryString(route.query.target_crop_id);
  return value ? value : null;
});
const safeReturnPath = computed(() => SAFE_RETURN_PATHS[queryString(route.query.return_to)] || '/seasonal');
const planContextQuery = computed(() => {
  const query: Record<string, string> = {};
  const varietyId = queryString(route.query.variety_id);
  const adminCode = safeAdminCode(route.query.admin_code) || selectedRegion.value?.admin_code || '';
  const city = safeCityCode(route.query.city_code);
  if (varietyId) query.variety_id = varietyId;
  if (adminCode) query.admin_code = adminCode;
  if (city) query.city_code = city;
  return query;
});

function goBack() {
  if (step.value > 1) {
    step.value--;
  } else {
    router.push(safeReturnPath.value);
  }
}

function nextStep() {
  if (step.value === 1) {
    step.value = 2; // district -> sunlight
  } else if (step.value === 2) {
    step.value = 3; // sunlight -> orientation/time observation
  } else if (step.value === 3) {
    step.value = 4; // rain exposure is mandatory for all paths
  }
}

function selectRegion(region: SelectedRegionMetadata) {
  selectedRegion.value = region;
  step.value = 2;
}

async function submit() {
  loading.value = true;
  try {
    const regionAdminCode = selectedRegion.value?.admin_code;
    const payload: any = {
      name: '我的露台',
      rainExposed: rainExposed.value, // mandatory: step 4 cannot be skipped
    };
    if (regionAdminCode) {
      payload.regionAdminCode = regionAdminCode;
    } else if (cityCode.value) {
      payload.cityCode = cityCode.value;
    }
    if (sunExposureLevel.value && sunExposureLevel.value !== 'UNSURE') {
      payload.sunExposureLevel = sunExposureLevel.value;
    } else {
      payload.sunOrientationRaw = orientation.value || 'unknown';
      payload.sunTimeObsRaw = timeObs.value || 'unknown';
    }
    await api.post('/terraces', payload);

    if (targetCropId.value) {
      router.push({
        path: `/perennial/${encodeURIComponent(targetCropId.value)}/plan`,
        query: planContextQuery.value,
      });
    } else {
      router.push(safeReturnPath.value === '/seasonal' ? '/mine' : safeReturnPath.value);
    }
  } catch (e: any) {
    showToast(e.response?.data?.message || '出错了，请重试');
  } finally {
    loading.value = false;
  }
}

async function prefillExistingProfile() {
  try {
    const res = await api.get('/terraces/mine');
    const profile = res.data;
    if (!profile) return;
    cityCode.value = profile.cityCode || '';
    const region = profile.region || null;
    const regionAdminCode = profile.regionAdminCode || profile.region_admin_code || region?.admin_code;
    const regionName = profile.regionName || profile.region_name || region?.name;
    const provinceName = profile.provinceName || profile.province_name || region?.province_name;
    const cityName = profile.cityName || profile.city_name || region?.city_name;
    if (regionAdminCode && regionName && provinceName && cityName && !profile.needsDistrictConfirmation) {
      selectedRegion.value = {
        admin_code: regionAdminCode,
        name: regionName,
        province_name: provinceName,
        city_name: cityName,
        selected_at: new Date().toISOString(),
      };
    }
    sunExposureLevel.value = profile.sunExposureLevel || '';
    orientation.value = profile.sunOrientationRaw || '';
    timeObs.value = profile.sunTimeObsRaw || '';
    rainExposed.value = typeof profile.rainExposed === 'boolean' ? profile.rainExposed : null;
  } catch (e) {
    // New users have no profile yet; keep the form blank.
  }
}

onMounted(async () => {
  await prefillExistingProfile();
});
</script>

<style scoped>
.terrace-wizard {
  padding-top: 46px;
  min-height: 100vh;
  box-sizing: border-box;
  background: #f7f8fa;
}
.loading {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.9);
}
</style>
