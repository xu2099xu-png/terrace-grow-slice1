import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import PerennialPlan from './PerennialPlan.vue';

const push = vi.fn();
let routeQuery: Record<string, string> = {};

vi.mock('vue-router', () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useRoute: () => ({ query: routeQuery }),
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

function cropDetail(cropId: string) {
  const names: Record<string, string> = {
    'crop-blueberry': '蓝莓',
    'crop-grape': '葡萄',
  };
  return {
    id: cropId,
    name: names[cropId] || cropId,
    lifeType: 'perennial',
    category: 'fruit',
    difficulty: 3,
    environmentRequirement: [],
    sowingCalendars: [],
  };
}

function cropVarieties(cropId: string) {
  const byCrop: Record<string, { id: string; name: string }[]> = {
    'crop-blueberry': [
      { id: 'var-oneal', name: '奥尼尔' },
      { id: 'var-misty', name: '薄雾' },
    ],
    'crop-grape': [{ id: 'var-grape-kyoho', name: '巨峰' }],
  };
  return byCrop[cropId] || [];
}

function mockCatalogAndMaterials(profile: any = { id: 'terrace-1' }) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/terraces/mine') return Promise.resolve({ data: profile });
    if (url.startsWith('/crops/') && url.endsWith('/varieties')) {
      const cropId = url.split('/')[2];
      return Promise.resolve({ data: cropVarieties(cropId) });
    }
    if (url.startsWith('/crops/')) {
      const cropId = url.split('/')[2].split('?')[0];
      return Promise.resolve({ data: cropDetail(cropId) });
    }
    if (url === '/materials') return Promise.resolve({ data: [] });
    if (url === '/materials/mine') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
}

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

function grapePlan() {
  return {
    ...matchPlan(),
    recommended_varieties: [
      {
        varietyId: 'var-grape-kyoho',
        name: '巨峰',
        score: 120,
        reasons: ['当前露台条件适合葡萄'],
        traits: { chill_hours_min: 0, heat_tolerance: 4, shade_tolerance: 2 },
      },
    ],
    selected_variety_id: 'var-grape-kyoho',
    container: {
      ...matchPlan().container,
      selected_type_id: 'ct-clay-pot',
      preferredTypes: [{ id: 'ct-clay-pot', name: '陶土盆', drainage: 4, aeration: 4, waterRetention: 2 }],
    },
    next_action: '按葡萄方案开始种植',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('PerennialPlan.vue — NO_MATCH short-circuit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeQuery = {};
  });

  it('NO_MATCH: hides container, soil, and material-adjustment areas', async () => {
    mockApi.post.mockResolvedValueOnce({ data: noMatchPlan() });
    mockCatalogAndMaterials();

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
    expect(html).not.toContain('容器');
    expect(html).not.toContain('配土');
    expect(html).not.toContain('查看/调整我的材料');
    expect(html).not.toContain('推荐品种');
  });

  it('MATCH: shows container, soil, and material-adjustment areas', async () => {
    mockApi.post.mockResolvedValueOnce({ data: matchPlan() });
    mockCatalogAndMaterials();

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    const html = wrapper.html();
    expect(html).toContain('适合种植');
    expect(html).toContain('已选植物');
    expect(html).toContain('容器');
    expect(html).toContain('尺寸');
    expect(html).toContain('配土');
    expect(html).toContain('查看/调整我的材料');
    expect(html).toContain('推荐品种');
  });

  it('shows recommendation context from terrace profile when route query differs', async () => {
    routeQuery = { admin_code: '130102', city_code: 'shijiazhuang' };
    mockApi.post.mockResolvedValueOnce({ data: matchPlan() });
    mockCatalogAndMaterials({
      id: 'terrace-1',
      cityCode: 'hangzhou',
      regionAdminCode: '330102',
      region: {
        admin_code: '330102',
        name: '上城区',
        province_name: '浙江省',
        city_name: '杭州市',
      },
    });

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('浙江省 · 杭州市 · 上城区');
    expect(wrapper.text()).not.toContain('shijiazhuang');
    expect(wrapper.text()).not.toContain('130102');
    expect(mockApi.get).toHaveBeenCalledWith('/crops/crop-blueberry?city_code=hangzhou');
  });

  it('uses neutral suitability class for unknown server suitability values', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: { ...matchPlan(), suitability: 'pending_review' },
    });
    mockCatalogAndMaterials();

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    const status = wrapper.get('strong');
    expect(status.text()).toBe('—');
    expect(status.classes()).toContain('neutral');
    expect(status.classes()).not.toContain('bad');
  });

  it('AI explanation sends current plan refs only after user submits', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: matchPlan() })
      .mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'answered',
          answer: '推荐理由',
          source: 'ai',
          cache_hit: false,
          citations: [{ fact_id: 'fact-1', label: '容器', value: '无纺布美植袋', unit: null }],
          warnings: [],
        },
      });
    mockCatalogAndMaterials();

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

  it('reloads on crop prop change and ignores stale plan responses', async () => {
    routeQuery = { admin_code: '130102', city_code: 'shijiazhuang' };
    const blueberry = deferred<{ data: ReturnType<typeof matchPlan> }>();
    mockApi.post.mockImplementation((url: string, body: any) => {
      if (url === '/recommendations/perennial' && body.crop_id === 'crop-blueberry') {
        return blueberry.promise;
      }
      if (url === '/recommendations/perennial' && body.crop_id === 'crop-grape') {
        return Promise.resolve({ data: grapePlan() });
      }
      return Promise.reject(new Error(`unexpected post ${url}`));
    });
    mockCatalogAndMaterials();

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('生成方案中');

    await wrapper.setProps({ cropId: 'crop-grape' });
    await flushPromises();

    expect(wrapper.text()).toContain('巨峰');
    expect(wrapper.text()).not.toContain('奥尼尔');

    blueberry.resolve({ data: matchPlan() });
    await flushPromises();

    expect(wrapper.text()).toContain('巨峰');
    expect(wrapper.text()).not.toContain('奥尼尔');

    await wrapper.get('button.van-button--success').trigger('click');
    expect(push).toHaveBeenCalledWith('/planting-start?crop_id=crop-grape&container_type_id=ct-clay-pot&variety_id=var-grape-kyoho&admin_code=130102&city_code=shijiazhuang');
  });

  it('passes selected variety id to existing recommendation endpoint when variety changes', async () => {
    const updated = {
      ...matchPlan(),
      selected_variety_id: 'var-misty',
      recommended_varieties: [
        ...matchPlan().recommended_varieties,
        {
          varietyId: 'var-misty',
          name: '薄雾',
          score: 105,
          reasons: ['服务端重新排序'],
          traits: { chill_hours_min: 250, heat_tolerance: 4, shade_tolerance: 2 },
        },
      ],
    };
    mockApi.post
      .mockResolvedValueOnce({
        data: {
          ...matchPlan(),
          recommended_varieties: updated.recommended_varieties,
        },
      })
      .mockResolvedValueOnce({ data: updated });
    mockCatalogAndMaterials();

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    await wrapper.findAll('.van-cell').find((cell) => cell.text().includes('薄雾'))!.trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenLastCalledWith('/recommendations/perennial', {
      crop_id: 'crop-blueberry',
      selected_container_type_id: 'ct-fabric-bag',
      selected_variety_id: 'var-misty',
    });
  });

  it('shows create-profile recovery state before recommendation when terrace profile is missing', async () => {
    routeQuery = {
      variety_id: 'var-oneal',
      admin_code: '130102',
      city_code: 'shijiazhuang',
    };
    mockCatalogAndMaterials(null);

    const wrapper = mount(PerennialPlan, {
      props: { cropId: 'crop-blueberry' },
      global: { plugins: [Vant] },
    });
    await flushPromises();

    expect(mockApi.get).toHaveBeenCalledWith('/terraces/mine');
    expect(mockApi.post).not.toHaveBeenCalledWith('/recommendations/perennial', expect.anything());
    expect(wrapper.text()).toContain('先创建露台档案');

    await wrapper.get('button.van-button--primary').trigger('click');
    expect(push).toHaveBeenCalledWith({
      path: '/terrace',
      query: {
        target_crop_id: 'crop-blueberry',
        variety_id: 'var-oneal',
        admin_code: '130102',
        city_code: 'shijiazhuang',
      },
    });
  });
});
