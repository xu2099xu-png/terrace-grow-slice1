import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import Home from './Home.vue';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
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

const crops = [
  { id: 'crop-fig', name: '无花果', lifeType: 'perennial', difficulty: 2, latinName: 'Ficus carica' },
  { id: 'crop-kiwi', name: '猕猴桃', lifeType: 'perennial', difficulty: 4 },
];

function mockHomeGets(terrace: any | Promise<{ data: any }>, cropRows = crops) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/crops?life_type=perennial') return Promise.resolve({ data: cropRows });
    if (url === '/terraces/mine') {
      return terrace instanceof Promise ? terrace : Promise.resolve({ data: terrace });
    }
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
}

describe('Home.vue perennial catalog entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads perennial crops from catalog and does not navigate while terrace status is still loading', async () => {
    let resolveTerrace!: (value: { data: any }) => void;
    const terracePromise = new Promise<{ data: any }>((resolve) => {
      resolveTerrace = resolve;
    });
    mockHomeGets(terracePromise);
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(mockApi.get).toHaveBeenCalledWith('/crops?life_type=perennial');
    expect(wrapper.text()).toContain('无花果');
    expect(wrapper.text()).toContain('检查中');
    const figCard = wrapper.findAll('.crop-card')[0];
    expect(figCard.attributes('disabled')).toBeDefined();
    await figCard.trigger('click');
    expect(push).not.toHaveBeenCalled();

    resolveTerrace({ data: { id: 'terrace-1', cityCode: 'shijiazhuang', regionAdminCode: '130102', needsDistrictConfirmation: false } });
    await flushPromises();
    await figCard.trigger('click');
    expect(push).toHaveBeenCalledWith({
      path: '/perennial/crop-fig',
      query: { admin_code: '130102', city_code: 'shijiazhuang' },
    });
  });

  it('shows terrace setup callout but still routes catalog cards to detail', async () => {
    mockHomeGets(null);
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.findAll('.crop-card')[1].trigger('click');

    expect(wrapper.text()).toContain('创建露台档案');
    expect(push).toHaveBeenCalledWith({
      path: '/perennial/crop-kiwi',
      query: {},
    });
  });

  it('shows loading error and retry for failed catalog request', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/crops?life_type=perennial') return Promise.reject(new Error('boom'));
      if (url === '/terraces/mine') return Promise.resolve({ data: { id: 'terrace-1' } });
      return Promise.reject(new Error(`unexpected get ${url}`));
    });
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('作物列表加载失败');
    expect(wrapper.findAll('.crop-card')).toHaveLength(0);
  });

  it('shows empty state when catalog has no perennial crops', async () => {
    mockHomeGets({ id: 'terrace-1' }, []);
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('暂无多年生作物');
  });
});
