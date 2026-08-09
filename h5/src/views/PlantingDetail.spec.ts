import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import * as Vant from 'vant';
import PlantingDetail from './PlantingDetail.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('vant', async () => {
  const actual = await vi.importActual<typeof import('vant')>('vant');
  return {
    ...actual,
    showToast: vi.fn(),
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

const nowResponse = {
  planting_id: 'planting-1',
  status: 'active',
  as_of_date: '2026-03-20',
  current_stage: {
    stage_key: 'transplant',
    stage_name: '定植',
    order: 1,
    start_offset: 0,
    end_offset: 7,
    actions: ['action_fixture_1'],
    explanation: '定植初期',
  },
  actions: ['action_fixture_1'],
  completed_action_keys: [],
  next_stage: { stage_key: 'care', stage_name: '缓苗', explanation: '保持湿润' },
  lifecycle_template_id: 'tpl-1',
  lifecycle_version: 1,
  warnings: ['避免暴晒'],
};

describe('PlantingDetail.vue AI explanation entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
  });

  it('renders core actions, posts planting typed refs, and keeps completion action', async () => {
    mockApi.get.mockResolvedValue({ data: nowResponse });
    mockApi.post.mockResolvedValueOnce({
      data: {
        status: 'answered',
        answer: '当前阶段需要完成定植操作',
        source: 'ai',
        cache_hit: false,
        citations: [{ fact_id: 'fact-stage', label: '阶段', value: '定植', unit: null }],
        warnings: [],
      },
    });

    const wrapper = mount(PlantingDetail, {
      props: { id: 'planting-1' },
      global: { plugins: [Vant] },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('现在要做什么');
    expect(wrapper.text()).toContain('完成定植初期操作');

    await wrapper.get('[data-testid="ai-explain-button"]').trigger('click');
    await wrapper.get('textarea').setValue('为什么做这些？');
    await wrapper.get('[data-testid="ai-submit-button"]').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/ai/ask', {
      context_type: 'planting_now',
      question: '为什么做这些？',
      planting_id: 'planting-1',
    });
    const aiBody = mockApi.post.mock.calls[0][1];
    expect(aiBody).not.toHaveProperty('current_stage');
    expect(aiBody).not.toHaveProperty('actions');
    expect(aiBody).not.toHaveProperty('lifecycle_template_id');

    await wrapper.get('.van-cell button').trigger('click');
    await flushPromises();

    expect(mockApi.post).toHaveBeenCalledWith('/plantings/planting-1/events', {
      action_key: 'action_fixture_1',
      client_event_id: 'h5-uuid-1',
    });
  });
});
