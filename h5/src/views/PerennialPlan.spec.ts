import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import PerennialPlan from './PerennialPlan.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// mock the api client module entirely
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

import api from '../api/client';

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

function noMatchPlan() {
  return {
    suitability: 'unsuitable',
    sunlight_status: {
      status: 'NO_MATCH',
      weight: 0,
      message: '日照不足',
      hours_range: [0, 2],
      confidence: 'medium',
    },
    recommended_varieties: [],
    selected_variety_id: null,
    pollination: { need_two: false, recommended_partners: [], note: null },
    container: null,
    soil_mix: null,
    missing_materials: [],
    water_risk: null,
    warnings: ['日照不足'],
    next_action: '这个位置日照确实不够，建议先看看更耐阴的植物',
    reasons: [],
  };
}

function matchPlan() {
  return {
    suitability: 'suitable',
    sunlight_status: {
      status: 'MATCH',
      weight: 1,
      message: null,
      hours_range: [6, 9],
      confidence: 'medium',
    },
    recommended_varieties: [
      {
        varietyId: 'var-oneal',
        name: '奥尼尔',
        score: 110,
        reasons: ['需冷量与当地冬季匹配'],
        traits: { chill_hours_min: 300, heat_tolerance: 4, shade_tolerance: 2 },
      },
    ],
    selected_variety_id: 'var-oneal',
    pollination: { need_two: false, recommended_partners: [], note: null },
    container: {
      volumeRange: [20, 30],
      minVolumeL: 15,
      minDepthCm: 30,
      preferredTypes: [{ id: 'ct-fabric-bag', name: '无纺布美植袋', drainage: 5, aeration: 5, waterRetention: 1 }],
      acceptableTypes: [],
      avoidTypes: [],
      supportRequired: false,
      repotNote: '建议每 2 年左右换盆一次',
      reason: null,
      selected_type_id: 'ct-fabric-bag',
    },
    soil_mix: {
      mix: [
        { materialId: 'mat-peat', material: '泥炭', pct: 50, liters: 12.5, source: 'user_owned' },
        { materialId: 'mat-perlite', material: '珍珠岩', pct: 30, liters: 7.5, source: 'user_owned' },
        { materialId: 'mat-pine-bark', material: '松鳞', pct: 20, liters: 5, source: 'user_owned' },
      ],
      missing: [],
      substitutions_applied: [],
      has_acidifying_component: true,
      ph_management_note: '该作物喜酸性土壤，建议定期检测 pH 并适时调酸',
      feasibility: 'optimal',
      water_retention_score: 3,
      drainage_score: 3.5,
      aeration_score: 3.5,
      reasons: [],
    },
    missing_materials: [],
    water_risk: { level: 'low', mitigation: [] },
    warnings: [],
    next_action: '材料已齐，按配方配土后即可买苗上盆',
    reasons: [],
  };
}

describe('PerennialPlan.vue — NO_MATCH short-circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NO_MATCH: hides container, soil, and material-adjustment areas', async () => {
    mockApi.post.mockResolvedValueOnce({ data: noMatchPlan() });
    mockApi.get.mockResolvedValueOnce({ data: [] }); // materials
    mockApi.get.mockResolvedValueOnce({ data: [] }); // /materials/mine

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    const html = wrapper.html();
    // only "why not recommended" + next action are shown
    expect(html).toContain('日照不足');
    expect(html).toContain('不建议');
    // container/soil/material-actions must NOT appear
    expect(html).not.toContain('容器建议');
    expect(html).not.toContain('配土方案');
    expect(html).not.toContain('查看/调整我的材料');
    expect(html).not.toContain('推荐品种');
  });

  it('MATCH: shows container, soil, and material-adjustment areas', async () => {
    mockApi.post.mockResolvedValueOnce({ data: matchPlan() });
    mockApi.get.mockResolvedValueOnce({ data: [] }); // materials
    mockApi.get.mockResolvedValueOnce({ data: [] }); // /materials/mine

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    const html = wrapper.html();
    expect(html).toContain('适合种植');
    expect(html).toContain('容器建议');
    expect(html).toContain('配土方案');
    expect(html).toContain('查看/调整我的材料');
    expect(html).toContain('推荐品种');
  });

  it('AI explanation sends current plan refs only after user submits', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: matchPlan() })
      .mockResolvedValueOnce({
        data: {
          status: 'answered',
          answer: '推荐理由',
          source: 'ai',
          cache_hit: false,
          citations: [{ fact_id: 'fact-1', label: '容器', value: '无纺布美植袋', unit: null }],
          warnings: [],
        },
      });
    mockApi.get.mockResolvedValueOnce({ data: [] }); // materials
    mockApi.get.mockResolvedValueOnce({ data: [] }); // /materials/mine

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="ai-explain-button"]').trigger('click');
    await wrapper.get('textarea').setValue('  为什么推荐？  ');
    await wrapper.get('[data-testid="ai-submit-button"]').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenLastCalledWith('/ai/ask', {
      context_type: 'perennial_plan',
      question: '为什么推荐？',
      crop_id: 'crop-blueberry',
      selected_container_type_id: 'ct-fabric-bag',
      selected_variety_id: 'var-oneal',
    });
  });
});
