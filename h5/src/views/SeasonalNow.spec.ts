import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import SeasonalNow from './SeasonalNow.vue';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useRoute: () => ({ query: { city_code: 'beijing' } }),
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
  });

  it('renders the list, keeps card navigation, and posts seasonal typed refs', async () => {
    mockApi.get.mockResolvedValueOnce({ data: seasonalResult });
    mockApi.post.mockResolvedValueOnce({
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

    await wrapper.get('.crop-card').trigger('click');
    expect(push).toHaveBeenCalledWith({
      path: '/crops/crop-carrot',
      query: {
        start_methods: 'direct_seed',
        city_code: 'beijing',
      },
    });
  });
});
