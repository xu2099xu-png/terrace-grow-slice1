import { describe, expect, it, vi, afterEach } from 'vitest';
import { AppConfigService } from '../config/runtime-config';
import { HttpLocationResolver } from './http-location.resolver';
import { MockLocationResolver } from './mock-location.resolver';

const config = (overrides: Partial<AppConfigService['value']> = {}) => ({
  value: {
    locationProvider: 'http',
    locationProviderApiKey: 'test-key',
    locationProviderBaseUrl: 'https://restapi.amap.com',
    locationProviderTimeoutMs: 3000,
    locationApiKey: 'test-key',
    ...overrides,
  },
} as AppConfigService);

describe('Slice 6 location resolve contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps provider adcode to an enabled internal district region', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: '1',
        regeocode: { addressComponent: { adcode: '110108', district: '海淀区' } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const regions = {
      resolveDistrictRegion: vi.fn().mockResolvedValue({
        admin_code: '110108',
        name: '海淀区',
        level: 'district',
        province_name: '北京市',
        city_name: '北京市',
      }),
    } as any;
    const out = await new HttpLocationResolver(config(), regions).resolveDistrict(39.9, 116.4);
    expect(out).toEqual({
      admin_code: '110108',
      name: '海淀区',
      level: 'district',
      province_name: '北京市',
      city_name: '北京市',
    });
    expect(regions.resolveDistrictRegion).toHaveBeenCalledWith('110108');
  });

  it('returns null for off mode, provider errors, malformed payloads, or unknown districts', async () => {
    await expect(new HttpLocationResolver(config({ locationProvider: 'off' }), undefined)
      .resolveDistrict(39.9, 116.4)).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', regeocode: { addressComponent: { adcode: '110108' } } }),
    }));
    const regions = { resolveDistrictRegion: vi.fn().mockResolvedValue(null) } as any;
    await expect(new HttpLocationResolver(config(), regions).resolveDistrict(39.9, 116.4))
      .resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: '1', regeocode: { addressComponent: { adcode: 'raw-provider-id' } } }),
    }));
    await expect(new HttpLocationResolver(config(), regions).resolveDistrict(39.9, 116.4))
      .resolves.toBeNull();
  });

  it('mock resolver returns deterministic district fixtures without precise coordinate storage', async () => {
    await expect(new MockLocationResolver().resolveDistrict(39.9, 116.4)).resolves.toEqual({
      admin_code: '110108',
      name: '海淀区',
      level: 'district',
      province_name: '北京市',
      city_name: '北京市',
    });
    await expect(new MockLocationResolver().resolveDistrict(0, 0)).resolves.toBeNull();
  });
});
