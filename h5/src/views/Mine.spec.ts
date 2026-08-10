import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import Mine from './Mine.vue';

const push = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import api from '../api/client';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const profile = {
  name: '南向露台',
  cityCode: 'beijing',
  region: {
    admin_code: '110101',
    name: '东城区',
    province_name: '北京市',
    city_name: '北京市',
  },
  sunHoursMin: 6,
  sunHoursMax: 9,
  sunConfidence: 'medium',
  climateZone: 'north_china',
};

const plantings = [
  {
    planting_id: 'planting-1',
    crop_name: '蓝莓',
    variety_name: '',
    start_date: '2026-08-09',
    status: 'active',
    current_stage_name: '缓苗',
  },
];

const materials = [
  { id: 'mat-peat', name: '泥炭', functionGroup: 'base', acidifying: true },
  { id: 'mat-coco', name: '椰糠', functionGroup: 'base', acidifying: false },
];

function mockSuccessfulLoad(options: { profile?: any; mineMaterials?: any[]; plantings?: any[] } = {}) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/terraces/mine') {
      if (options.profile === null) return Promise.reject({ response: { status: 404 } });
      return Promise.resolve({ data: options.profile ?? profile });
    }
    if (url === '/users/me/plantings') return Promise.resolve({ data: options.plantings ?? plantings });
    if (url === '/materials') return Promise.resolve({ data: materials });
    if (url === '/materials/mine') return Promise.resolve({ data: options.mineMaterials ?? [{ materialId: 'mat-peat' }] });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

function mountMine() {
  return mount(Mine, {
    global: { plugins: [Vant] },
    attachTo: document.body,
  });
}

describe('Mine.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('shows profile, edit entry, materials, and planting list', async () => {
    mockSuccessfulLoad();
    const wrapper = mountMine();
    await flushPromises();

    expect(wrapper.text()).toContain('南向露台');
    expect(wrapper.text()).toContain('北京市 · 北京市 · 东城区');
    expect(wrapper.text()).toContain('6–9h（较确定）');
    expect(wrapper.text()).toContain('我的材料');
    expect(wrapper.text()).toContain('泥炭');
    expect(wrapper.text()).toContain('基础基质');
    expect(wrapper.text()).toContain('蓝莓');

    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('地区 / 档案'))!.trigger('click');
    expect(push).toHaveBeenCalledWith('/terrace?return_to=mine');
  });

  it('shows only explicit sun confidence and neutral placeholder for missing hours', async () => {
    mockSuccessfulLoad({
      profile: {
        ...profile,
        sunHoursMin: 2,
        sunHoursMax: 4,
        sunConfidence: 'low',
      },
      plantings: [],
      mineMaterials: [],
    });
    const lowWrapper = mountMine();
    await flushPromises();
    expect(lowWrapper.text()).toContain('2–4h（不确定）');
    lowWrapper.unmount();

    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockSuccessfulLoad({
      profile: {
        ...profile,
        sunHoursMin: 3,
        sunHoursMax: 5,
        sunConfidence: undefined,
      },
      plantings: [],
      mineMaterials: [],
    });
    const unknownWrapper = mountMine();
    await flushPromises();
    expect(unknownWrapper.text()).toContain('3–5h');
    expect(unknownWrapper.text()).not.toContain('3–5h（较确定）');
    unknownWrapper.unmount();

    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockSuccessfulLoad({
      profile: {
        ...profile,
        sunHoursMin: null,
        sunHoursMax: null,
        sunConfidence: 'medium',
      },
      plantings: [],
      mineMaterials: [],
    });
    const missingWrapper = mountMine();
    await flushPromises();
    expect(missingWrapper.text()).toContain('日照估算—');
    expect(missingWrapper.text()).not.toContain('null–nullh');
    expect(missingWrapper.text()).not.toContain('较确定');
  });

  it('shows create terrace CTA when profile is absent', async () => {
    mockSuccessfulLoad({ profile: null, plantings: [], mineMaterials: [] });
    const wrapper = mountMine();
    await flushPromises();

    expect(wrapper.text()).toContain('还没有露台档案');
    await wrapper.findAll('button').find((button) => button.text().includes('创建露台档案'))!.trigger('click');
    expect(push).toHaveBeenCalledWith('/terrace?return_to=mine');
  });

  it('saves edited material inventory and refreshes selected materials', async () => {
    mockSuccessfulLoad({ mineMaterials: [{ materialId: 'mat-peat' }] });
    mockApi.put.mockResolvedValueOnce({ data: { ok: true } });
    const wrapper = mountMine();
    await flushPromises();

    const cocoRow = wrapper.findAll('[data-testid="material-row"]').find((cell) => cell.text().includes('椰糠'))!;
    expect(cocoRow.attributes('role')).toBe('button');
    expect(cocoRow.attributes('tabindex')).toBe('0');
    expect(cocoRow.attributes('aria-label')).toBe('选择椰糠');
    await cocoRow.trigger('keydown.enter');
    expect(cocoRow.attributes('aria-label')).toBe('取消选择椰糠');
    await wrapper.findAll('button').find((button) => button.text().includes('保存材料'))!.trigger('click');
    await flushPromises();

    expect(mockApi.put).toHaveBeenCalledWith('/users/me/materials', {
      material_ids: ['mat-peat', 'mat-coco'],
    });
    expect(wrapper.text()).toContain('已保存');
  });

  it('shows load error and retries', async () => {
    mockApi.get.mockRejectedValueOnce({ response: { data: { message: 'boom' } } });
    const wrapper = mountMine();
    await flushPromises();

    expect(wrapper.text()).toContain('boom');
    mockSuccessfulLoad({ plantings: [], mineMaterials: [] });
    await wrapper.findAll('button').find((button) => button.text().includes('重试'))!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('南向露台');
  });
});
