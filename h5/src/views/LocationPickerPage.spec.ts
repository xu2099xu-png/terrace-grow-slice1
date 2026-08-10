import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import * as Vant from 'vant';
import LocationPickerPage from './LocationPickerPage.vue';
import { SELECTED_REGION_STORAGE_KEY } from '../api/region-selection';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  route: null as any,
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => mocks.route,
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
            ? h('span', `${props.selectedRegion.province_name} · ${props.selectedRegion.city_name} · ${props.selectedRegion.name}`)
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

function installGeolocation(handler: (success: PositionCallback, error: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn(handler),
    },
  });
}

describe('LocationPickerPage.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    mocks.route = reactive({ query: { return_to: '/' } as Record<string, string> });
  });

  it('resolves browser location, stores only region metadata, and safely returns', async () => {
    mocks.route.query = { return_to: '/?admin_code=330102' };
    installGeolocation((success) => success({
      coords: { latitude: 30.2, longitude: 120.1 },
    } as GeolocationPosition));
    mockApi.post.mockResolvedValueOnce({
      data: {
        admin_code: '330102',
        name: '上城区',
        level: 'district',
        province_name: '浙江省',
        city_name: '杭州市',
      },
    });

    mount(LocationPickerPage, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/location/resolve', { lat: 30.2, lng: 120.1 });
    expect(mocks.replace).toHaveBeenCalledWith('/?admin_code=330102');
    const stored = localStorage.getItem(SELECTED_REGION_STORAGE_KEY)!;
    expect(stored).toContain('上城区');
    expect(stored).not.toContain('30.2');
    expect(stored).not.toContain('120.1');
  });

  it('shows denied state and returns after manual district selection', async () => {
    installGeolocation((_success, error) => error({ code: 1, message: 'denied' } as GeolocationPositionError));

    const wrapper = mount(LocationPickerPage, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('未授权定位');
    expect(wrapper.text()).toContain('浏览器未授权定位，请手动选择区县');
    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith('/');
    expect(localStorage.getItem(SELECTED_REGION_STORAGE_KEY)).toContain('上城区');
  });

  it('blocks unsafe return_to targets', async () => {
    mocks.route.query = { return_to: 'https://evil.example/path' };
    installGeolocation((_success, error) => error({ code: 1, message: 'denied' } as GeolocationPositionError));

    const wrapper = mount(LocationPickerPage, { global: { plugins: [Vant] }, attachTo: document.body });
    await flushPromises();
    await wrapper.get('[data-testid="mock-region-picker"] button').trigger('click');
    await flushPromises();

    expect(mocks.replace).toHaveBeenCalledWith('/');
  });
});
