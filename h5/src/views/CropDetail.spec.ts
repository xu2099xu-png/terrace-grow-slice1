import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import * as Vant from 'vant';
import CropDetail from './CropDetail.vue';

const push = vi.fn();
let routeQuery: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useRoute: () => ({ query: routeQuery }),
}));

vi.mock('../api/catalog', () => ({
  fetchCropDetail: vi.fn(),
  fetchCropVarieties: vi.fn(),
}));

import { fetchCropDetail, fetchCropVarieties } from '../api/catalog';

const mockFetchCropDetail = fetchCropDetail as unknown as ReturnType<typeof vi.fn>;
const mockFetchCropVarieties = fetchCropVarieties as unknown as ReturnType<typeof vi.fn>;

describe('CropDetail.vue unified crop detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeQuery = {};
  });

  it('combines basic info, varieties, key facts and environment without empty knowledge section', async () => {
    mockFetchCropDetail.mockResolvedValueOnce({
      id: 'crop-fig',
      name: '无花果',
      latinName: 'Ficus carica',
      lifeType: 'perennial',
      category: 'fruit',
      difficulty: 2,
      containerFriendly: true,
      acidityNeed: 'slightly_acid',
      environmentRequirement: [{ id: 'env-1', minSunHours: 6, frostSensitive: false }],
      sowingCalendars: [],
    });
    mockFetchCropVarieties.mockResolvedValueOnce([
      { id: 'var-brown-turkey', name: '布朗土耳其', containerFit: 4 },
    ]);

    const wrapper = mount(CropDetail, {
      props: { id: 'crop-fig' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('无花果');
    expect(wrapper.text()).toContain('布朗土耳其');
    expect(wrapper.text()).toContain('关键事实');
    expect(wrapper.text()).toContain('6h 以上日照');
    expect(wrapper.text()).not.toContain('知识');
  });

  it('keeps selected variety and region context when opening perennial plan', async () => {
    routeQuery = { admin_code: '130102', city_code: 'shijiazhuang', variety_id: 'var-oneal' };
    mockFetchCropDetail.mockResolvedValueOnce({
      id: 'crop-blueberry',
      name: '蓝莓',
      lifeType: 'perennial',
      category: 'fruit',
      difficulty: 3,
      environmentRequirement: [],
      sowingCalendars: [],
    });
    mockFetchCropVarieties.mockResolvedValueOnce([
      { id: 'var-oneal', name: '奥尼尔' },
    ]);

    const wrapper = mount(CropDetail, {
      props: { id: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    await wrapper.get('button.van-button--success').trigger('click');
    expect(push).toHaveBeenCalledWith({
      path: '/perennial/crop-blueberry/plan',
      query: {
        admin_code: '130102',
        city_code: 'shijiazhuang',
        variety_id: 'var-oneal',
      },
    });
  });
});
