import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import AiExplanationPanel from './AiExplanationPanel.vue';

vi.mock('../api/client', () => ({
  default: {
    post: vi.fn(),
  },
}));

import api from '../api/client';

const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>;
};

const answered = {
  status: 'answered',
  answer: '因为当前引用事实支持这个建议',
  source: 'ai',
  cache_hit: true,
  citations: [{ fact_id: 'fact-1', label: '日照', value: 6, unit: 'h' }],
  warnings: ['仅供参考'],
};

function ok(data: unknown) {
  return { status: 200, data };
}

function mountPanel(props = {}) {
  return mount(AiExplanationPanel, {
    props: {
      contextType: 'perennial_plan',
      cropId: 'crop-blueberry',
      selectedContainerTypeId: 'ct-fabric-bag',
      selectedVarietyId: 'var-oneal',
      ...props,
    },
    global: { plugins: [Vant] },
    attachTo: document.body,
  });
}

async function ask(wrapper: ReturnType<typeof mountPanel>, text = '  为什么这样推荐？  ') {
  await wrapper.get('[data-testid="ai-explain-button"]').trigger('click');
  await wrapper.get('textarea').setValue(text);
  await wrapper.get('[data-testid="ai-submit-button"]').trigger('click');
  await flushPromises();
}

describe('AiExplanationPanel.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('posts exact perennial typed refs without agricultural facts', async () => {
    mockApi.post.mockResolvedValueOnce(ok(answered));
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(mockApi.post).toHaveBeenCalledWith('/ai/ask', {
      context_type: 'perennial_plan',
      question: '为什么这样推荐？',
      crop_id: 'crop-blueberry',
      selected_container_type_id: 'ct-fabric-bag',
      selected_variety_id: 'var-oneal',
    });
    const body = mockApi.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('plan');
    expect(body).not.toHaveProperty('sunlight_status');
    expect(body).not.toHaveProperty('soil_mix');
    expect(body).not.toHaveProperty('weather');
  });

  it('posts exact seasonal typed refs without recommendation facts', async () => {
    mockApi.post.mockResolvedValueOnce(ok(answered));
    const wrapper = mountPanel({
      contextType: 'seasonal_item',
      cityCode: 'beijing',
      cropId: 'crop-carrot',
      selectedContainerTypeId: undefined,
      selectedVarietyId: undefined,
    });

    await ask(wrapper, '为什么现在种？');

    expect(mockApi.post).toHaveBeenCalledWith('/ai/ask', {
      context_type: 'seasonal_item',
      question: '为什么现在种？',
      city_code: 'beijing',
      crop_id: 'crop-carrot',
    });
    const body = mockApi.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('available_start_methods');
    expect(body).not.toHaveProperty('weather_assessment');
    expect(body).not.toHaveProperty('warnings');
  });

  it('posts exact planting typed refs without lifecycle facts', async () => {
    mockApi.post.mockResolvedValueOnce(ok(answered));
    const wrapper = mountPanel({
      contextType: 'planting_now',
      plantingId: 'planting-1',
      cropId: undefined,
      selectedContainerTypeId: undefined,
      selectedVarietyId: undefined,
    });

    await ask(wrapper, '下一步是什么？');

    expect(mockApi.post).toHaveBeenCalledWith('/ai/ask', {
      context_type: 'planting_now',
      question: '下一步是什么？',
      planting_id: 'planting-1',
    });
    const body = mockApi.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('current_stage');
    expect(body).not.toHaveProperty('actions');
    expect(body).not.toHaveProperty('lifecycle');
  });

  it('renders answered status, cache marker, citations, and warnings', async () => {
    mockApi.post.mockResolvedValueOnce(ok(answered));
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-state"]').text()).toBe('AI 解释（已复用）');
    expect(wrapper.get('[data-testid="ai-answer"]').text()).toBe('因为当前引用事实支持这个建议');
    expect(wrapper.get('[data-testid="ai-citation"]').text()).toContain('日照');
    expect(wrapper.get('[data-testid="ai-warning"]').text()).toContain('仅供参考');
  });

  it.each([
    ['disabled', 'AI 已关闭，以下为规则解释'],
    ['provider_unavailable', 'AI 暂时不可用，以下为规则解释'],
    ['insufficient_data', '暂无足够信息'],
  ])('renders %s state', async (status, label) => {
    mockApi.post.mockResolvedValueOnce(ok({
        status,
        answer: '规则返回',
        source: 'rules',
        cache_hit: false,
        citations: [],
        warnings: [],
      }));
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-state"]').text()).toBe(label);
    expect(wrapper.get('[data-testid="ai-answer"]').text()).toBe('规则返回');
  });

  it('renders 429 rate-limit state', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { status: 429 } });
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-429"]').text()).toContain('请求太频繁');
  });

  it('escapes answer as plain text', async () => {
    mockApi.post.mockResolvedValueOnce(ok({
        status: 'answered',
        answer: '<b>unsafe</b><script>alert(1)</script>',
        source: 'ai',
        cache_hit: false,
        citations: [],
        warnings: [],
      }));
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-answer"]').text()).toBe('<b>unsafe</b><script>alert(1)</script>');
    expect(wrapper.html()).toContain('&lt;b&gt;unsafe&lt;/b&gt;');
    expect(wrapper.html()).not.toContain('<script>alert(1)</script>');
  });

  it('renders retryable request error for non-429 HTTP failure without fake fallback', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { status: 500, data: { message: '服务异常' } } });
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-error"]').text()).toContain('服务异常');
    expect(wrapper.find('[data-testid="ai-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-answer"]').exists()).toBe(false);
  });

  it('leaves 401 to the shared identity/client path without fake fallback', async () => {
    mockApi.post.mockRejectedValueOnce({ response: { status: 401 } });
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.find('[data-testid="ai-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-answer"]').exists()).toBe(false);
  });

  it('rejects unexpected 200 response shape instead of rendering an unknown machine state', async () => {
    mockApi.post.mockResolvedValueOnce(ok({
      status: 'fallback',
      answer: 'bad',
      source: 'rules',
      cache_hit: false,
      citations: [],
      warnings: [],
    }));
    const wrapper = mountPanel();

    await ask(wrapper);

    expect(wrapper.get('[data-testid="ai-error"]').text()).toContain('解释请求返回异常');
    expect(wrapper.find('[data-testid="ai-state"]').exists()).toBe(false);
  });
});
