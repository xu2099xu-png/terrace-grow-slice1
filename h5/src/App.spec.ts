import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import * as Vant from 'vant';
import { readFileSync } from 'node:fs';
import App from './App.vue';

const mocks = vi.hoisted(() => ({
  route: null as any,
}));

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
}));

vi.mock('./api/identity', () => ({
  ensureIdentity: vi.fn(() => Promise.resolve('token-a')),
}));

describe('App.vue three-tab IA', () => {
  beforeEach(() => {
    mocks.route = reactive({ path: '/', meta: { tab: 'seasonal' } });
  });

  it('shows the frozen top-level tab labels', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [Vant],
        stubs: {
          RouterView: { template: '<div />' },
        },
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('时令种植');
    expect(wrapper.text()).toContain('长期种植');
    expect(wrapper.text()).toContain('我的');
    expect(wrapper.classes()).toContain('app-wrapper--mobile-shell');
    expect(wrapper.get('.app-main').exists()).toBe(true);
  });

  it('keeps desktop content constrained to the mobile tool width', () => {
    const source = readFileSync('src/App.vue', 'utf8');

    expect(source).toContain('--app-mobile-max-width: 430px');
    expect(source).toContain('max-width: var(--app-mobile-max-width)');
    expect(source).toContain('.app-wrapper--mobile-shell .van-nav-bar.van-nav-bar--fixed');
    expect(source).toContain('.app-wrapper--mobile-shell .van-tabbar.van-tabbar--fixed');
    expect(source).toContain('left: 50% !important');
    expect(source).toContain('width: var(--app-mobile-max-width) !important');
    expect(source).toContain('right: auto !important');
  });
});
