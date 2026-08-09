import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import PlantingStart from './PlantingStart.vue';

const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();
let routeQuery: Record<string, string>;

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace, back }),
  useRoute: () => ({ query: routeQuery }),
}));

vi.mock('vant', async () => {
  const actual = await vi.importActual<typeof import('vant')>('vant');
  return {
    ...actual,
    showToast: vi.fn(),
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

const crops = [
  {
    id: 'crop-grape',
    name: '葡萄',
    varieties: [{ id: 'var-grape-kyoho', name: '巨峰' }],
  },
];

const plan = {
  selected_variety_id: 'var-grape-kyoho',
  container: {
    selected_type_id: 'ct-clay-pot',
    preferredTypes: [{ id: 'ct-clay-pot', name: '陶土盆' }],
    acceptableTypes: [],
  },
};

function mountView() {
  return mount(PlantingStart, {
    global: { plugins: [Vant] },
    attachTo: document.body,
  });
}

describe('PlantingStart.vue baseline loading and submit guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    routeQuery = {
      crop_id: 'crop-grape',
      variety_id: 'var-grape-kyoho',
      container_type_id: 'ct-clay-pot',
    };
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
  });

  it('shows explicit loading, then error with retry that reloads content', async () => {
    mockApi.get.mockRejectedValueOnce(new Error('load failed'));
    mockApi.post.mockResolvedValueOnce({ data: plan });

    const wrapper = mountView();

    expect(wrapper.text()).toContain('加载中');
    await flushPromises();

    expect(wrapper.text()).toContain('数据加载失败，请返回重试');

    mockApi.get.mockResolvedValueOnce({ data: crops });
    mockApi.post.mockResolvedValueOnce({ data: plan });
    await wrapper.get('button.van-button--primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('确认开始种植');
    expect(wrapper.text()).toContain('葡萄');
    expect(wrapper.text()).toContain('巨峰');
    expect(wrapper.text()).toContain('陶土盆');
  });

  it('keeps content visible while submit is pending and prevents double submit', async () => {
    mockApi.get.mockResolvedValueOnce({ data: crops });
    mockApi.post.mockResolvedValueOnce({ data: plan });
    const wrapper = mountView();
    await flushPromises();

    let resolvePlanting!: (value: unknown) => void;
    const plantingPromise = new Promise((resolve) => {
      resolvePlanting = resolve;
    });
    mockApi.get.mockResolvedValueOnce({ data: { id: 'terrace-1' } });
    mockApi.post.mockReturnValueOnce(plantingPromise);

    const submit = wrapper.get('button.van-button--success');
    await submit.trigger('click');
    await submit.trigger('click');

    const plantingCalls = mockApi.post.mock.calls.filter(([url]) => url === '/plantings');
    expect(plantingCalls).toHaveLength(1);
    expect(wrapper.text()).toContain('确认开始种植');
    expect(submit.attributes('disabled')).toBeDefined();

    resolvePlanting({ data: { planting: { id: 'planting-1' } } });
    await flushPromises();

    expect(replace).toHaveBeenCalledWith('/plantings/planting-1');
  });
});
