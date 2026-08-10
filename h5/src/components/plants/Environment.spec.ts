import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import * as Vant from 'vant';
import Environment from './Environment.vue';

describe('Environment.vue', () => {
  it('renders true frost sensitivity only when server returns true', () => {
    const wrapper = mount(Environment, {
      props: {
        requirements: [{ id: 'env-true', minSunHours: 6, frostSensitive: true }],
      },
      global: { plugins: [Vant] },
    });

    expect(wrapper.text()).toContain('霜冻敏感');
  });

  it('renders false frost sensitivity only when server returns false', () => {
    const wrapper = mount(Environment, {
      props: {
        requirements: [{ id: 'env-false', minSunHours: 6, frostSensitive: false }],
      },
      global: { plugins: [Vant] },
    });

    expect(wrapper.text()).toContain('霜冻不敏感');
  });

  it('hides frost value for unknown null or undefined sensitivity', () => {
    const wrapper = mount(Environment, {
      props: {
        requirements: [
          { id: 'env-null', minSunHours: 6, frostSensitive: null },
          { id: 'env-undefined', minSunHours: 4 },
        ],
      },
      global: { plugins: [Vant] },
    });

    expect(wrapper.text()).toContain('6h 以上日照');
    expect(wrapper.text()).toContain('4h 以上日照');
    expect(wrapper.text()).not.toContain('霜冻敏感');
    expect(wrapper.text()).not.toContain('霜冻不敏感');
    expect(wrapper.text()).not.toContain('较耐寒');
  });
});
