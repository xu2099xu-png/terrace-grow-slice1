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

vi.mock('../components/RegionPicker.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['selectedRegion'],
      emits: ['select'],
      setup(props, { emit }) {
        return () => h('div', { 'data-testid': 'mock-region-picker' }, [
          props.selectedRegion
            ? h('span', `${props.selectedRegion.province_name} ${props.selectedRegion.city_name} ${props.selectedRegion.name}`)
            : null,
          h('button', {
            type: 'button',
            onClick: () => emit('select', {
              admin_code: '330102',
              name: '上城区',
              province_name: '浙江省',
              city_name: '杭州市',
              selected_at: '2026-08-10T00:00:00.000Z',
            }),
          }, '选择上城区'),
        ]);
      },
    }),
  };
});

import api from '../api/client';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

async function clickRadio(wrapper: ReturnType<typeof mount>, label: string) {
  const radio = wrapper.findAll('[role="radio"]').find((item) => item.text().includes(label));
  expect(radio, `radio ${label}`).toBeTruthy();
  await radio!.trigger('click');
}

describe('TerraceWizard.vue city selection and return target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query = {};
  });

  it('auto-advances after active district selection and preserves plan context after submit', async () => {
    query = {
      target_crop_id: 'crop-grape',
      variety_id: 'var-grape-kyoho',
      admin_code: '330106',
      city_code: 'hangzhou',
    };
    mockApi.get.mockResolvedValueOnce({ data: null });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('您所在的区县');
    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('露台日照情况');
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('阳光充足'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('朝向和日照时段');
    await clickRadio(wrapper, '南');
    await clickRadio(wrapper, '全天');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('会淋到雨'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      regionAdminCode: '330102',
      rainExposed: true,
      sunExposureLevel: 'LONG',
    });
    expect(push).toHaveBeenCalledWith({
      path: '/perennial/crop-grape/plan',
      query: {
        variety_id: 'var-grape-kyoho',
        admin_code: '330106',
        city_code: 'hangzhou',
      },
    });
  });

  it('prefills an existing district without auto-advancing and returns to mine by default', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        cityCode: 'shanghai',
        needsDistrictConfirmation: false,
        region: {
          admin_code: '310101',
          name: '黄浦区',
          province_name: '上海市',
          city_name: '上海市',
        },
        sunExposureLevel: 'MEDIUM',
        sunOrientationRaw: 'south',
        sunTimeObsRaw: 'allday',
        rainExposed: false,
      },
    });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).toContain('上海市 上海市 黄浦区');
    expect(wrapper.text()).toContain('您所在的区县');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      regionAdminCode: '310101',
      rainExposed: false,
      sunExposureLevel: 'MEDIUM',
    });
    expect(push).toHaveBeenCalledWith('/mine');
  });

  it('keeps city-level legacy profiles on manual cityCode payload until a district is confirmed', async () => {
    mockApi.get.mockResolvedValueOnce({
      data: {
        cityCode: 'shanghai',
        needsDistrictConfirmation: true,
        region: null,
        sunExposureLevel: 'MEDIUM',
        rainExposed: false,
      },
    });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    expect(wrapper.text()).not.toContain('上海市 上海市 黄浦区');
    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('露台日照情况');
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('半天左右'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await clickRadio(wrapper, '东');
    await clickRadio(wrapper, '上午');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('基本淋不到'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      regionAdminCode: '330102',
      rainExposed: false,
      sunExposureLevel: 'MEDIUM',
    });
  });

  it('keeps assisted sunlight fields only for unsure sunlight', async () => {
    mockApi.get.mockResolvedValueOnce({ data: null });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('我不太确定'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await clickRadio(wrapper, '北');
    await clickRadio(wrapper, '很少');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('基本淋不到'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/terraces', {
      name: '我的露台',
      regionAdminCode: '330102',
      rainExposed: false,
      sunOrientationRaw: 'north',
      sunTimeObsRaw: 'rarely',
    });
  });

  it('uses return_to=mine for the first-step back action', async () => {
    query = { return_to: 'mine' };
    mockApi.get.mockResolvedValueOnce({ data: null });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.find('.van-nav-bar__left').trigger('click');

    expect(push).toHaveBeenCalledWith('/mine');
  });

  it('filters unsafe return_to and non-canonical city_code from navigation context', async () => {
    query = {
      target_crop_id: 'crop-grape',
      admin_code: 'not-a-code',
      city_code: 'evil-city',
      return_to: 'https://example.invalid',
    };
    mockApi.get.mockResolvedValueOnce({ data: null });
    mockApi.post.mockResolvedValueOnce({ data: { id: 'terrace-1' } });

    const wrapper = mount(TerraceWizard, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.find('.van-nav-bar__left').trigger('click');
    expect(push).toHaveBeenCalledWith('/seasonal');
    push.mockClear();

    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('阳光充足'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await clickRadio(wrapper, '南');
    await clickRadio(wrapper, '全天');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();
    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('会淋到雨'))!.trigger('click');
    await wrapper.get('.actions button').trigger('click');
    await flushPromises();

    expect(push).toHaveBeenCalledWith({
      path: '/perennial/crop-grape/plan',
      query: {
        admin_code: '330102',
      },
    });
  });
});
