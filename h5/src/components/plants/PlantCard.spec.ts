import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PlantCard from './PlantCard.vue';

describe('PlantCard.vue', () => {
  it('renders neutral catalog facts without suitability conclusions', async () => {
    const wrapper = mount(PlantCard, {
      props: {
        crop: {
          id: 'crop-test',
          name: '测试作物',
          latinName: 'Test plant',
          lifeType: 'perennial',
          category: 'fruit',
          difficulty: 2,
          containerFriendly: true,
          acidityNeed: 'acid_required',
          coverImage: '/images/test.jpg',
        },
        command: '查看详情',
      },
    });

    expect(wrapper.get('img').attributes('src')).toBe('/images/test.jpg');
    expect(wrapper.text()).toContain('多年生');
    expect(wrapper.text()).toContain('水果');
    expect(wrapper.text()).toContain('有点难度');
    expect(wrapper.text()).not.toContain('适合露台盆栽');
    expect(wrapper.text()).not.toContain('不优先露台盆栽');
    expect(wrapper.text()).not.toContain('喜酸土壤');

    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toHaveLength(1);
  });

  it('uses stable placeholder when cover image is missing', () => {
    const wrapper = mount(PlantCard, {
      props: {
        crop: { id: 'crop-test', name: '薄荷', lifeType: 'perennial', category: 'herb' },
        command: '查看详情',
      },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('.plant-card__placeholder').text()).toBe('薄');
  });

  it('does not emit selection while disabled', async () => {
    const wrapper = mount(PlantCard, {
      props: {
        crop: { id: 'crop-test', name: '薄荷', lifeType: 'perennial' },
        command: '检查中',
        disabled: true,
      },
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
