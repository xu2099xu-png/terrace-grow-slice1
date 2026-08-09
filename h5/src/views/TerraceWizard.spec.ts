import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import TerraceWizard from './TerraceWizard.vue';

const push = vi.fn();
let query: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query }),
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

const cities = [
  { city_code: 'beijing', city_name: '北京' },
  { city_code: 'shanghai', city_name: '上海' },
];

describe('TerraceWizard.vue city selection and return target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = {};
  });

  it('uses supported-cities and returns to the target crop after submit', async () => {
    query = { target_crop_id: 'crop-grape' };
    mockApi.get
      .mockResolvedValueOnce({ data: cities })
      .mockResolvedValueOnce({ data: null });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('北京');
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('北京'))!.trigger('click');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('阳光充足'))!.trigger('click');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('会淋到雨'))!.trigger('click');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      cityCode: 'beijing',
      rainExposed: true,
      sunExposureLevel: 'LONG',
    });
    expect(push).toHaveBeenCalledWith('/plan/crop-grape');
  });

  it('prefills an existing profile and returns to mine by default', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: cities })
      .mockResolvedValueOnce({
        data: {
          cityCode: 'shanghai',
          sunExposureLevel: 'MEDIUM',
          rainExposed: false,
        },
      });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('上海');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      cityCode: 'shanghai',
      rainExposed: false,
      sunExposureLevel: 'MEDIUM',
    });
    expect(push).toHaveBeenCalledWith('/mine');
  });

  it('uses return_to=mine for the first-step back action', async () => {
    query = { return_to: 'mine' };
    mockApi.get
      .mockResolvedValueOnce({ data: cities })
      .mockResolvedValueOnce({ data: null });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.find('.van-nav-bar__left').trigger('click');

    expect(push).toHaveBeenCalledWith('/mine');
  });
});
