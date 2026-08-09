import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import * as Vant from 'vant';
import SeasonalNow from './SeasonalNow.vue';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  route: null as any,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: mocks.back }),
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

const seasonalResult = {
  date: '2026-08-09',
  city_code: 'beijing',
  climate_zone_code: 'north_china',
  climate_data_status: 'available',
  weather_data_status: 'available',
  items: [
    {
      crop_id: 'crop-carrot',
      crop_name: '胡萝卜',
      available_start_methods: ['direct_seed'],
      season_status: 'in_window',
      weather_assessment: 'ok',
      difficulty: 1,
      warnings: ['注意间苗'],
    },
  ],
};

describe('SeasonalNow.vue AI explanation entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mocks.route = reactive({ query: { city_code: 'beijing' } as Record<string, string> });
  });

  it('renders the list, keeps card navigation, and posts seasonal typed refs', async () => {
    mockApi.get.mockResolvedValueOnce({ data: seasonalResult });
    mockApi.post.mockResolvedValueOnce({
      status: 200,
      data: {
        status: 'answered',
        answer: '现在在播种窗口内',
        source: 'ai',
        cache_hit: false,
        citations: [{ fact_id: 'fact-season', label: '城市', value: 'beijing', unit: null }],
        warnings: [],
      },
    });

    const wrapper = mount(SeasonalNow, {
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('胡萝卜');
    await wrapper.get('[data-testid="ai-explain-button"]').trigger('click');
    await wrapper.get('textarea').setValue('为什么现在适合种？');
    await wrapper.get('[data-testid="ai-submit-button"]').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/ai/ask', {
      context_type: 'seasonal_item',
      question: '为什么现在适合种？',
      city_code: 'beijing',
      crop_id: 'crop-carrot',
    });
    const body = mockApi.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('available_start_methods');
    expect(body).not.toHaveProperty('weather_assessment');
    expect(body).not.toHaveProperty('warnings');

    expect(wrapper.get('.crop-card').attributes('role')).toBe('button');
    expect(wrapper.get('.crop-card').attributes('tabindex')).toBe('0');
    await wrapper.get('.crop-card').trigger('keydown.space');
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/crops/crop-carrot',
      query: {
        start_methods: 'direct_seed',
        city_code: 'beijing',
      },
    });
  });

  it('opens city picker when deep link has no city and loads selected city', async () => {
    mocks.route.query = {};
    mockApi.get
      .mockResolvedValueOnce({ data: [{ city_code: 'shanghai', city_name: '上海' }] })
      .mockResolvedValueOnce({
        data: {
          ...seasonalResult,
          date: '2026-08-09',
          city_code: 'shanghai',
          climate_zone_code: 'east_china',
          items: [],
        },
      });

    const wrapper = mount(SeasonalNow, {
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="city-picker"]').text()).toContain('上海');
    await wrapper.get('[data-testid="city-option"]').trigger('click');
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith({
      path: '/seasons/now',
      query: { city_code: 'shanghai' },
    });
    expect(mockApi.get).toHaveBeenLastCalledWith('/seasons/now?city_code=shanghai');
    expect(wrapper.text()).toContain('上海');
    expect(wrapper.text()).toContain('服务端日期 2026-08-09');
    expect(wrapper.text()).toContain('当前没有可种的作物');
    expect(wrapper.text()).toContain('更换城市');
    expect(wrapper.text()).toContain('返回首页');
  });

  it('renders recoverable empty state and can reopen city picker', async () => {
    mockApi.get
      .mockResolvedValueOnce({
        data: {
          ...seasonalResult,
          date: '2026-08-09',
          city_code: 'beijing',
          climate_zone_code: 'north_china',
          items: [],
        },
      })
      .mockResolvedValueOnce({ data: [{ city_code: 'fuzhou', city_name: '福州' }] });

    const wrapper = mount(SeasonalNow, {
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('服务端日期 2026-08-09');
    expect(wrapper.text()).toContain('城市 beijing');
    expect(wrapper.text()).toContain('当前没有可种的作物');
    await wrapper.findAll('button').find((button) => button.text().includes('更换城市'))!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="city-picker"]').text()).toContain('福州');
  });

  it('reloads when route city query changes and does not double-load after local city select', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: seasonalResult })
      .mockResolvedValueOnce({
        data: {
          ...seasonalResult,
          city_code: 'shanghai',
          climate_zone_code: 'east_china',
          items: [],
        },
      });

    const wrapper = mount(SeasonalNow, {
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    mocks.route.query = { city_code: 'shanghai' };
    await nextTick();
    await flushPromises();

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/seasons/now?city_code=beijing');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/seasons/now?city_code=shanghai');
    expect(wrapper.text()).toContain('城市 shanghai');

    mockApi.get
      .mockResolvedValueOnce({ data: [{ city_code: 'fuzhou', city_name: '福州' }] })
      .mockResolvedValueOnce({
        data: {
          ...seasonalResult,
          city_code: 'fuzhou',
          climate_zone_code: 'south_china',
          items: [],
        },
      });
    await wrapper.findAll('button').find((button) => button.text().includes('更换城市'))!.trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="city-option"]').trigger('click');
    await flushPromises();

    expect(mockApi.get).toHaveBeenCalledTimes(4);
    expect(mockApi.get).toHaveBeenLastCalledWith('/seasons/now?city_code=fuzhou');
    mocks.route.query = { city_code: 'fuzhou' };
    await nextTick();
    await flushPromises();
    expect(mockApi.get).toHaveBeenCalledTimes(4);
  });
});
