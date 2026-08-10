import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import * as Vant from 'vant';
import { readFileSync } from 'node:fs';
import SeasonalHome from './SeasonalHome.vue';
import { SELECTED_REGION_STORAGE_KEY } from '../api/region-selection';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: null as any,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => mocks.route,
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../api/client';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const homePayload = {
  today: {
    date: '2026-08-10',
    weekday: '一',
    timezone: 'Asia/Shanghai',
    lunar: { status: 'available', month: '六', day: '廿八' },
    solar_term: null,
  },
  region: {
    admin_code: '330102',
    name: '上城区',
    province_name: '浙江省',
    city_name: '杭州市',
  },
  agri_region_match: {
    status: 'direct',
    selected_area_code: '330102',
    climate_area_code: '330102',
    climate_zone_code: 'east_china',
    proxy_used: false,
    proxy_name: null,
    distance_km: null,
  },
  weather: {
    status: 'available',
    source: 'qweather',
    observed_at: null,
    updated_at: '2026-08-10T08:00:00.000Z',
    cache_hit: false,
    attribution: {
      name: '和风天气/QWeather',
      url: 'https://www.qweather.com',
      sources: ['https://developer.qweather.com/attribution.html', '杭州市气象台'],
    },
    summary: '多云 26°C',
    temperature_current_c: 26,
    temperature_min_c: 22,
    temperature_max_c: 30,
    condition: '多云',
    precipitation_mm: null,
    precipitation_probability_percent: 20,
    humidity_percent: 72,
    wind: '东南风',
    warnings: [],
  },
  seasonal: {
    date: '2026-08-10',
    location_status: 'ok',
    climate_zone_code: 'east_china',
    climate_data_status: 'available',
    weather_data_status: 'available',
    has_profile: false,
    items: [{
      crop_id: 'crop-carrot',
      crop_name: '胡萝卜',
      available_start_methods: ['direct_seed'],
      season_status: 'in_window',
      difficulty: 1,
      warnings: [],
    }, {
      crop_id: 'crop-lettuce',
      crop_name: '生菜',
      available_start_methods: ['direct_seed'],
      season_status: 'in_window',
      difficulty: 1,
      warnings: [],
    }],
    warnings: [],
  },
};

const cropRows = [{
  id: 'crop-carrot',
  name: '胡萝卜',
  lifeType: 'seasonal',
  coverImage: '/assets/carrot.jpg',
  harvestDaysMin: 60,
  harvestDaysMax: 80,
  environmentRequirement: [{ id: 'env-carrot', minSunHours: 6 }],
}, {
  id: 'crop-lettuce',
  name: '生菜',
  lifeType: 'seasonal',
  coverImage: null,
}];

function storeRegion() {
  localStorage.setItem(SELECTED_REGION_STORAGE_KEY, JSON.stringify({
    admin_code: '330102',
    name: '上城区',
    province_name: '浙江省',
    city_name: '杭州市',
    selected_at: '2026-08-10T00:00:00.000Z',
  }));
}

function mockHomeApis(payload = homePayload) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/seasonal/home?admin_code=330102') return Promise.resolve({ data: payload });
    if (url === '/crops?life_type=seasonal') return Promise.resolve({ data: cropRows });
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

describe('SeasonalHome.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.route = reactive({ fullPath: '/', query: {} as Record<string, string> });
  });

  it('redirects to the standalone location picker when no district is selected', async () => {
    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('正在前往地区选择');
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/location',
      query: { return_to: '/' },
    });
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('renders the closure hierarchy and joins seasonal crop display fields without N+1', async () => {
    storeRegion();
    mockHomeApis();

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(mockApi.get).toHaveBeenCalledWith('/seasonal/home?admin_code=330102');
    expect(mockApi.get).toHaveBeenCalledWith('/crops?life_type=seasonal');
    expect(wrapper.find('.van-nav-bar__title').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('时令种植');
    expect(wrapper.text()).toContain('当前区县');
    expect(wrapper.text()).toContain('浙江省 · 杭州市 · 上城区');
    expect(wrapper.text()).toContain('区县天气');
    expect(wrapper.text()).toContain('26°C');
    expect(wrapper.text()).toContain('今天');
    expect(wrapper.text()).toContain('2026-08-10 · 周一');
    expect(wrapper.text()).toContain('今日推荐');
    expect(wrapper.text()).toContain('胡萝卜');
    expect(wrapper.text()).toContain('时令内');
    expect(wrapper.text()).toContain('建议直播');
    expect(wrapper.text()).toContain('60-80天');
    expect(wrapper.findAll('.plant-card')).toHaveLength(2);
    expect(wrapper.get('.plant-card img').attributes('src')).toBe('/assets/carrot.jpg');
    expect(wrapper.get('.plant-card__media .van-icon').exists()).toBe(true);
  });

  it('guards mobile overview and plant grid responsive structure', () => {
    const homeSource = readFileSync('src/views/SeasonalHome.vue', 'utf8');
    const gridSource = readFileSync('src/components/home/PlantCardGrid.vue', 'utf8');

    expect(homeSource).toContain('class="overview-grid"');
    expect(homeSource).not.toContain('<van-nav-bar title="时令种植" fixed');
    expect(homeSource).not.toContain('padding-top: 46px');
    expect(homeSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(homeSource).toContain('@media (max-width: 359px)');
    expect(gridSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(gridSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(gridSource).toContain('class="plant-card__media"');
    expect(gridSource).toContain('height: 50px');
    expect(gridSource).toContain('overflow-wrap: anywhere');
    expect(gridSource).toContain('min-height: 132px');
    expect(gridSource).not.toContain('minSunHours');
  });

  it('keeps unknown seasonal status and empty start methods neutral', async () => {
    storeRegion();
    mockHomeApis({
      ...homePayload,
      seasonal: {
        ...homePayload.seasonal,
        items: [{
          ...homePayload.seasonal.items[0],
          season_status: 'mystery_status',
          available_start_methods: [],
        }],
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('胡萝卜');
    expect(wrapper.text()).not.toContain('mystery_status');
    expect(wrapper.text()).not.toContain('建议');
  });

  it('keeps QWeather attribution duplicates visible and ordered', async () => {
    storeRegion();
    const duplicatedSource = 'https://developer.qweather.com/attribution.html';
    mockHomeApis({
      ...homePayload,
      weather: {
        ...homePayload.weather,
        attribution: {
          name: '和风天气/QWeather',
          url: 'https://www.qweather.com',
          sources: [
            duplicatedSource,
            duplicatedSource,
            duplicatedSource,
            '杭州市气象台',
            '国家预警信息发布中心',
            '中国天气网',
          ],
        },
        warnings: ['暴雨蓝色预警', '暴雨蓝色预警'],
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.findAll('.attribution span').map((node) => node.text())).toEqual([
      duplicatedSource,
      duplicatedSource,
      duplicatedSource,
      '杭州市气象台',
      '国家预警信息发布中心',
      '中国天气网',
    ]);
    expect(wrapper.findAll('.warning-list span').map((node) => node.text())).toEqual([
      '暴雨蓝色预警',
      '暴雨蓝色预警',
    ]);
  });

  it('shows weather unavailable without rendering missing weather facts', async () => {
    storeRegion();
    mockHomeApis({
      ...homePayload,
      weather: {
        ...homePayload.weather,
        status: 'unavailable',
        summary: '',
        temperature_current_c: null,
        temperature_min_c: null,
        temperature_max_c: null,
        precipitation_probability_percent: null,
        wind: null,
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('天气暂不可用');
    expect(wrapper.text()).toContain('不可用');
    expect(wrapper.findAll('.weather-grid span')).toHaveLength(0);
  });

  it('shows recoverable error state when seasonal home fails', async () => {
    storeRegion();
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/seasonal/home?admin_code=330102') {
        return Promise.reject({ response: { data: { message: '今日时令加载失败' } } });
      }
      if (url === '/crops?life_type=seasonal') return Promise.resolve({ data: cropRows });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('今日时令加载失败');
    expect(wrapper.text()).toContain('重试');
    expect(wrapper.text()).toContain('重新选择区县');
  });

  it('shows empty recommendations and can route to location selection', async () => {
    storeRegion();
    mockHomeApis({
      ...homePayload,
      seasonal: {
        ...homePayload.seasonal,
        items: [],
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('当前没有可种的作物');
    await wrapper.findAll('button').find((button) => button.text().includes('更换区县'))!.trigger('click');

    expect(mocks.push).toHaveBeenCalledWith({
      path: '/location',
      query: { return_to: '/' },
    });
  });

  it('opens crop detail with continuous admin_code and optional canonical city_code', async () => {
    storeRegion();
    mockHomeApis({
      ...homePayload,
      seasonal: {
        ...homePayload.seasonal,
        items: [{
          ...homePayload.seasonal.items[0],
          city_code: 'hangzhou',
        }],
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('[data-testid="seasonal-item"]').trigger('click');

    expect(mocks.push).toHaveBeenCalledWith({
      path: '/crops/crop-carrot',
      query: {
        admin_code: '330102',
        city_code: 'hangzhou',
        start_methods: 'direct_seed',
      },
    });
  });
});
