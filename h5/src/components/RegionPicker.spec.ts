import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import { readFileSync } from 'node:fs';
import RegionPicker from './RegionPicker.vue';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from '../api/client';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
};

describe('RegionPicker.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens municipality districts under the canonical province code and emits a district', async () => {
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/location/popular-cities') {
        return Promise.resolve({
          data: [{
            display_area_code: '110000',
            display_name: '北京',
            kind: 'municipality',
            province_admin_code: '110000',
            province_name: '北京市',
            city_admin_code: null,
            city_name: null,
          }],
        });
      }
      if (url === '/location/regions?level=province') {
        return Promise.resolve({
          data: [{
            admin_code: '110000',
            name: '北京市',
            level: 'province',
            parent_admin_code: null,
            is_municipality: true,
          }],
        });
      }
      if (url === '/location/regions?level=district&parent_admin_code=110000') {
        return Promise.resolve({
          data: [{
            admin_code: '110101',
            name: '东城区',
            level: 'district',
            parent_admin_code: '110000',
            is_municipality: false,
          }],
        });
      }
      return Promise.resolve({ data: [] });
    });

    const wrapper = mount(RegionPicker, { global: { plugins: [Vant] } });
    await flushPromises();

    await wrapper.get('[data-testid="popular-region"]').trigger('click');
    await flushPromises();

    expect(mockApi.get).toHaveBeenCalledWith('/location/regions?level=district&parent_admin_code=110000');
    expect(wrapper.get('[data-testid="district-option"]').classes()).toContain('region-row');
    expect(wrapper.get('.list-shell').exists()).toBe(true);
    await wrapper.get('[data-testid="district-option"]').trigger('click');

    expect(wrapper.emitted('select')?.[0][0]).toMatchObject({
      admin_code: '110101',
      name: '东城区',
      province_name: '北京市',
      city_name: '北京市',
    });
  });

  it('keeps runtime RegionList nodes covered by scoped styles', () => {
    const source = readFileSync('src/components/RegionPicker.vue', 'utf8');

    expect(source).toContain(':deep(.list-shell)');
    expect(source).toContain(':deep(.region-row)');
    expect(source).toContain(':deep(.region-row small)');
  });
});
