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

describe('Home.vue onboarding entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not navigate while terrace status is still loading', async () => {
    let resolveTerrace!: (value: { data: any }) => void;
    mockApi.get.mockReturnValueOnce(new Promise((resolve) => {
      resolveTerrace = resolve;
    }));
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('检查中');
    const grapeCard = wrapper.findAll('.crop-card')[1];
    expect(grapeCard.attributes('disabled')).toBeDefined();
    await grapeCard.trigger('click');
    expect(push).not.toHaveBeenCalled();

    resolveTerrace({ data: { id: 'terrace-1' } });
    await flushPromises();
    await grapeCard.trigger('click');
    expect(push).toHaveBeenCalledWith('/plan/crop-grape');
  });

  it('routes crop start to terrace wizard when no terrace exists', async () => {
    mockApi.get.mockResolvedValueOnce({ data: null });
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.findAll('.crop-card')[1].trigger('click');

    expect(wrapper.text()).toContain('创建露台档案');
    expect(push).toHaveBeenCalledWith('/terrace?target_crop_id=crop-grape');
  });

  it('routes crop start directly to plan when terrace exists', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { id: 'terrace-1' } });
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.findAll('.crop-card')[0].trigger('click');

    expect(push).toHaveBeenCalledWith('/plan/crop-blueberry');
    expect(wrapper.text()).toContain('查看方案');
  });

  it('routes to wizard after pending terrace status resolves empty', async () => {
    let resolveTerrace!: (value: { data: any }) => void;
    mockApi.get.mockReturnValueOnce(new Promise((resolve) => {
      resolveTerrace = resolve;
    }));
    const wrapper = mount(Home, { global: { plugins: [Vant] } });
    await flushPromises();

    const blueberryCard = wrapper.findAll('.crop-card')[0];
    await blueberryCard.trigger('click');
    expect(push).not.toHaveBeenCalled();

    resolveTerrace({ data: null });
    await flushPromises();
    await blueberryCard.trigger('click');

    expect(push).toHaveBeenCalledWith('/terrace?target_crop_id=crop-blueberry');
  });
});
