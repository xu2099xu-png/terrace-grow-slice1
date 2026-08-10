<template>
  <div class="region-picker" data-testid="region-picker">
    <section v-if="selectedRegion" class="selected-context">
      <span>当前区县</span>
      <strong>{{ selectedRegion.province_name }} · {{ selectedRegion.city_name }} · {{ selectedRegion.name }}</strong>
    </section>

    <section class="picker-section">
      <div class="section-title">
        <span>热门地区</span>
        <van-button v-if="popularError" size="mini" round plain type="primary" @click="loadPopular">重试</van-button>
      </div>
      <div v-if="popularLoading" class="state-row">热门地区加载中…</div>
      <div v-else-if="popularError" class="state-row warn">{{ popularError }}</div>
      <div v-else class="popular-grid">
        <button
          v-for="item in popular"
          :key="item.display_area_code"
          type="button"
          class="popular-chip"
          data-testid="popular-region"
          @click="selectPopular(item)"
        >
          {{ item.display_name }}
        </button>
      </div>
    </section>

    <van-tabs v-model:active="activePane" sticky offset-top="46px" class="region-tabs">
      <van-tab title="省份">
        <RegionList
          :rows="provinces"
          :loading="provinceLoading"
          :error="provinceError"
          empty-text="暂无省份"
          test-id="province-option"
          @retry="loadProvinces"
          @select="selectProvince"
        />
      </van-tab>
      <van-tab title="城市" :disabled="!selectedProvince || selectedProvince.is_municipality">
        <RegionList
          :rows="cities"
          :loading="cityLoading"
          :error="cityError"
          empty-text="请选择省份"
          test-id="city-option"
          @retry="retryCities"
          @select="selectCity"
        />
      </van-tab>
      <van-tab title="区县" :disabled="!districtParentCode">
        <RegionList
          :rows="districts"
          :loading="districtLoading"
          :error="districtError"
          empty-text="请选择城市或直辖市"
          test-id="district-option"
          @retry="retryDistricts"
          @select="selectDistrict"
        />
      </van-tab>
    </van-tabs>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, onMounted, ref, type PropType } from 'vue';
import { showToast } from 'vant';
import {
  fetchPopularRegions,
  fetchRegions,
  type PopularRegionRow,
  type RegionRow,
  type SelectedRegionMetadata,
} from '../api/region-selection';

defineProps<{
  selectedRegion?: SelectedRegionMetadata | null;
}>();

const emit = defineEmits<{
  select: [region: SelectedRegionMetadata];
}>();

const RegionList = defineComponent({
  props: {
    rows: { type: Array as PropType<RegionRow[]>, required: true },
    loading: { type: Boolean, required: true },
    error: { type: String, required: true },
    emptyText: { type: String, required: true },
    testId: { type: String, required: true },
  },
  emits: ['retry', 'select'],
  setup(props, { emit }) {
    return () => {
      if (props.loading) {
        return h('div', { class: 'state-row' }, '加载中…');
      }
      if (props.error) {
        return h('div', { class: 'state-block' }, [
          h('p', props.error),
          h('button', { class: 'retry-button', type: 'button', onClick: () => emit('retry') }, '重试'),
        ]);
      }
      if (!props.rows.length) {
        return h('div', { class: 'state-row' }, props.emptyText);
      }
      return h(
        'div',
        { class: 'list-shell' },
        props.rows.map((row) =>
          h(
            'button',
            {
              key: row.admin_code,
              class: 'region-row',
              type: 'button',
              'data-testid': props.testId,
              onClick: () => emit('select', row),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  emit('select', row);
                }
              },
            },
            [
              h('span', row.name),
              h('small', row.admin_code),
            ],
          ),
        ),
      );
    };
  },
});

const activePane = ref(0);
const popular = ref<PopularRegionRow[]>([]);
const provinces = ref<RegionRow[]>([]);
const cities = ref<RegionRow[]>([]);
const districts = ref<RegionRow[]>([]);
const selectedProvince = ref<RegionRow | null>(null);
const selectedCity = ref<RegionRow | null>(null);
const districtParentCode = ref('');
const popularContext = ref<PopularRegionRow | null>(null);
const provinceLoading = ref(false);
const cityLoading = ref(false);
const districtLoading = ref(false);
const popularLoading = ref(false);
const provinceError = ref('');
const cityError = ref('');
const districtError = ref('');
const popularError = ref('');

async function loadPopular() {
  popularLoading.value = true;
  popularError.value = '';
  try {
    popular.value = await fetchPopularRegions();
  } catch (e: any) {
    popularError.value = e.response?.data?.message || '热门地区加载失败';
  } finally {
    popularLoading.value = false;
  }
}

async function loadProvinces() {
  provinceLoading.value = true;
  provinceError.value = '';
  try {
    provinces.value = await fetchRegions('province');
  } catch (e: any) {
    provinceError.value = e.response?.data?.message || '省份加载失败';
  } finally {
    provinceLoading.value = false;
  }
}

async function loadCities(parentAdminCode: string) {
  cityLoading.value = true;
  cityError.value = '';
  try {
    cities.value = await fetchRegions('city', parentAdminCode);
  } catch (e: any) {
    cityError.value = e.response?.data?.message || '城市加载失败';
  } finally {
    cityLoading.value = false;
  }
}

async function loadDistricts(parentAdminCode: string) {
  districtLoading.value = true;
  districtError.value = '';
  districtParentCode.value = parentAdminCode;
  try {
    districts.value = await fetchRegions('district', parentAdminCode);
  } catch (e: any) {
    districtError.value = e.response?.data?.message || '区县加载失败';
  } finally {
    districtLoading.value = false;
  }
}

async function selectPopular(item: PopularRegionRow) {
  popularContext.value = item;
  selectedProvince.value = {
    admin_code: item.province_admin_code,
    name: item.province_name,
    level: 'province',
    parent_admin_code: null,
    is_municipality: item.kind === 'municipality',
  };
  selectedCity.value = item.kind === 'city' && item.city_admin_code
    ? {
      admin_code: item.city_admin_code,
      name: item.city_name || item.display_name,
      level: 'city',
      parent_admin_code: item.province_admin_code,
      is_municipality: false,
    }
    : null;
  cities.value = selectedCity.value ? [selectedCity.value] : [];
  districts.value = [];
  await loadDistricts(item.kind === 'municipality' ? item.province_admin_code : item.display_area_code);
  activePane.value = 2;
}

async function selectProvince(row: RegionRow) {
  selectedProvince.value = row;
  selectedCity.value = null;
  popularContext.value = null;
  cities.value = [];
  districts.value = [];
  districtParentCode.value = '';
  if (row.is_municipality) {
    await loadDistricts(row.admin_code);
    activePane.value = 2;
  } else {
    activePane.value = 1;
    await loadCities(row.admin_code);
  }
}

async function selectCity(row: RegionRow) {
  selectedCity.value = row;
  popularContext.value = null;
  districts.value = [];
  await loadDistricts(row.admin_code);
  activePane.value = 2;
}

function selectDistrict(row: RegionRow) {
  const provinceName = popularContext.value?.province_name || selectedProvince.value?.name || '';
  const cityName = popularContext.value?.city_name || selectedCity.value?.name || provinceName;
  if (!provinceName || !cityName) {
    showToast('请先选择省市');
    return;
  }
  emit('select', {
    admin_code: row.admin_code,
    name: row.name,
    province_name: provinceName,
    city_name: cityName,
    selected_at: new Date().toISOString(),
  });
}

function retryCities() {
  if (selectedProvince.value) {
    loadCities(selectedProvince.value.admin_code);
  }
}

function retryDistricts() {
  if (districtParentCode.value) {
    loadDistricts(districtParentCode.value);
  }
}

onMounted(() => {
  loadPopular();
  loadProvinces();
});
</script>

<style scoped>
.region-picker {
  padding: 8px 0 16px;
}
.selected-context {
  margin: 0 16px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef8f0;
  color: #1f7a3a;
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
}
.selected-context span,
:deep(.region-row small) {
  font-size: 12px;
  color: #6b8f77;
}
.selected-context strong {
  font-size: 14px;
  line-height: 1.35;
}
.picker-section {
  padding: 0 16px 12px;
}
.section-title {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #323233;
  font-weight: 600;
  font-size: 14px;
}
.popular-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.popular-chip {
  height: 34px;
  border: 1px solid #d9eee0;
  border-radius: 8px;
  background: #fff;
  color: #1f7a3a;
  font-size: 13px;
}
.region-tabs {
  --van-tabs-bottom-bar-color: #2ba84a;
}
:deep(.state-row),
:deep(.state-block) {
  padding: 18px 16px;
  text-align: center;
  color: #646566;
  font-size: 13px;
}
:deep(.state-row.warn) {
  color: #b56b00;
}
:deep(.state-block p) {
  margin: 0 0 8px;
}
:deep(.retry-button) {
  border: 1px solid #2ba84a;
  border-radius: 999px;
  background: #fff;
  color: #2ba84a;
  padding: 5px 14px;
}
:deep(.list-shell) {
  padding: 8px 16px 0;
}
:deep(.region-row) {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-bottom: 1px solid #f0f1f2;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font-size: 15px;
  color: #323233;
}
</style>
