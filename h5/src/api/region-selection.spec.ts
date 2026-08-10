import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from './client';
import {
  SELECTED_REGION_STORAGE_KEY,
  fetchRegions,
  loadSelectedRegion,
  saveSelectedRegion,
} from './region-selection';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('region-selection adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('builds region directory URLs with machine parent codes', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] });

    await fetchRegions('district', '110000');

    expect(mockApi.get).toHaveBeenCalledWith('/location/regions?level=district&parent_admin_code=110000');
  });

  it('stores only selected region display metadata', () => {
    saveSelectedRegion({
      admin_code: '330102',
      name: '上城区',
      province_name: '浙江省',
      city_name: '杭州市',
      selected_at: '2026-08-10T00:00:00.000Z',
      lat: 30.2,
      lng: 120.1,
    } as any);

    const raw = localStorage.getItem(SELECTED_REGION_STORAGE_KEY)!;
    expect(raw).toContain('330102');
    expect(raw).not.toContain('30.2');
    expect(raw).not.toContain('120.1');
    expect(loadSelectedRegion()).toEqual({
      admin_code: '330102',
      name: '上城区',
      province_name: '浙江省',
      city_name: '杭州市',
      selected_at: '2026-08-10T00:00:00.000Z',
    });
  });
});
