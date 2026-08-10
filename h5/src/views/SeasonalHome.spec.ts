import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import * as Vant from 'vant';
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

vi.mock('../components/RegionPicker.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
    emits: ['select'],
    setup(_, { emit }) {
      return () => h('button', {
        'data-testid': 'mock-region-picker',
        onClick: () => emit('select', {
          admin_code: '330102',
          name: '上城区',
          province_name: '浙江省',
          city_name: '杭州市',
          selected_at: '2026-08-10T00:00:00.000Z',
        }),
      }, '选择上城区');
    },
    }),
  };
});

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
    status: 'unavailable',
    source: null,
    observed_at: null,
    updated_at: null,
    cache_hit: false,
    attribution: { name: null, url: null, sources: [] },
    summary: '',
    temperature_current_c: null,
    temperature_min_c: null,
    temperature_max_c: null,
    condition: null,
    precipitation_mm: null,
    precipitation_probability_percent: null,
    humidity_percent: null,
    wind: null,
    warnings: ['天气暂不可用'],
  },
  seasonal: {
    date: '2026-08-10',
    location_status: 'ok',
    climate_zone_code: 'east_china',
    climate_data_status: 'available',
    weather_data_status: 'unavailable',
    has_profile: false,
    items: [{
      crop_id: 'crop-carrot',
      crop_name: '胡萝卜',
      available_start_methods: ['direct_seed'],
      season_status: 'in_window',
      difficulty: 1,
      warnings: [],
    }],
    warnings: [],
  },
};

function installGeolocation(handler: (success: PositionCallback, error: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(handler),
    },
  });
}

async function expectManualPickerCanSelectDistrict(wrapper: ReturnType<typeof mount>, message: string) {
  expect(wrapper.text()).toContain(message);
  await wrapper.get('[data-testid="mock-region-picker"]').trigger('click');
  await flushPromises();

  expect(mockApi.get).toHaveBeenCalledWith('/seasonal/home?admin_code=330102');
  expect(wrapper.text()).toContain('浙江省 · 杭州市 · 上城区');
}

describe('SeasonalHome.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    mocks.route = reactive({ query: {} as Record<string, string> });
  });

  it('resolves browser location, saves only display metadata, and shows QWeather attribution', async () => {
    installGeolocation((success) => success({
      coords: { latitude: 30.2, longitude: 120.1 },
    } as GeolocationPosition));
    mockApi.post.mockResolvedValueOnce({
      data: {
        admin_code: '330102',
        name: '上城区',
        level: 'district',
        province_name: '浙江省',
        city_name: '杭州市',
      },
    });
    mockApi.get.mockResolvedValueOnce({
      data: {
        ...homePayload,
        weather: {
          ...homePayload.weather,
          status: 'available',
          summary: '多云 26°C',
          temperature_current_c: 26,
          attribution: {
            name: '和风天气/QWeather',
            url: 'https://www.qweather.com',
            sources: ['https://developer.qweather.com/attribution.html', '杭州市气象台'],
          },
        },
      },
    });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/location/resolve', { lat: 30.2, lng: 120.1 });
    expect(mockApi.get).toHaveBeenCalledWith('/seasonal/home?admin_code=330102');
    expect(wrapper.text()).toContain('浙江省 · 杭州市 · 上城区');
    expect(wrapper.text()).toContain('农历六月廿八');
    const link = wrapper.get('a');
    expect(link.text()).toBe('和风天气/QWeather');
    expect(link.attributes('href')).toBe('https://www.qweather.com');
    const stored = localStorage.getItem(SELECTED_REGION_STORAGE_KEY)!;
    expect(stored).toContain('上城区');
    expect(stored).not.toContain('30.2');
    expect(stored).not.toContain('120.1');
  });

  it('falls back to manual district selection when geolocation is denied', async () => {
    installGeolocation((_success, error) => error({ code: 1, message: 'denied' } as GeolocationPositionError));
    mockApi.get.mockResolvedValueOnce({ data: homePayload });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    await expectManualPickerCanSelectDistrict(wrapper, '定位未完成，请手动选择区县');
  });

  it('falls back to manual district selection when geolocation is unavailable in an insecure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
    mockApi.get.mockResolvedValueOnce({ data: homePayload });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(mockApi.post).not.toHaveBeenCalled();
    await expectManualPickerCanSelectDistrict(wrapper, '无法使用浏览器定位，请手动选择区县');
  });

  it('falls back to manual district selection when geolocation times out', async () => {
    installGeolocation((_success, error) => error({ code: 3, message: 'timeout' } as GeolocationPositionError));
    mockApi.get.mockResolvedValueOnce({ data: homePayload });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    await expectManualPickerCanSelectDistrict(wrapper, '定位未完成，请手动选择区县');
  });

  it('falls back to manual district selection when location resolve returns null', async () => {
    installGeolocation((success) => success({
      coords: { latitude: 0, longitude: 0 },
    } as GeolocationPosition));
    mockApi.post.mockResolvedValueOnce({ data: null });
    mockApi.get.mockResolvedValueOnce({ data: homePayload });

    const wrapper = mount(SeasonalHome, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/location/resolve', { lat: 0, lng: 0 });
    await expectManualPickerCanSelectDistrict(wrapper, '定位暂未匹配到支持区县，请手动选择');
  });

  it('renders duplicate attribution sources and warnings in exact response order', async () => {
    localStorage.setItem(SELECTED_REGION_STORAGE_KEY, JSON.stringify({
      admin_code: '330102',
      name: '上城区',
      province_name: '浙江省',
      city_name: '杭州市',
      selected_at: '2026-08-10T00:00:00.000Z',
    }));
    const duplicatedSource = 'https://developer.qweather.com/attribution.html';
    mockApi.get.mockResolvedValueOnce({
      data: {
        ...homePayload,
        weather: {
          ...homePayload.weather,
          status: 'available',
          summary: '多云',
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
});
