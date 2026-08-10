import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import * as Vant from 'vant';
import BasicInfo from './BasicInfo.vue';

describe('BasicInfo.vue', () => {
  it('renders server cover image when provided', () => {
    const wrapper = mount(BasicInfo, {
      props: {
        crop: {
          id: 'crop-test',
          name: '测试作物',
          lifeType: 'perennial',
          category: 'fruit',
          difficulty: 2,
          coverImage: '/images/crop.jpg',
        },
      },
      global: { plugins: [Vant] },
    });

    expect(wrapper.get('.basic-info__media img').attributes('src')).toBe('/images/crop.jpg');
    expect(wrapper.get('.basic-info__media img').attributes('alt')).toBe('测试作物');
  });

  it('renders neutral placeholder when cover image is missing', () => {
    const wrapper = mount(BasicInfo, {
      props: {
        crop: {
          id: 'crop-test',
          name: '薄荷',
          lifeType: 'perennial',
          category: 'herb',
          difficulty: 1,
        },
      },
      global: { plugins: [Vant] },
    });

    expect(wrapper.find('.basic-info__media img').exists()).toBe(false);
    expect(wrapper.get('.basic-info__media').text()).toBe('薄');
  });
});
