import { describe, it, expect } from 'vitest';
import { resolveLifecycle, LifecycleTemplateRow } from './index';

const template: LifecycleTemplateRow = {
  id: 'lc-grape-crop-v1',
  version: 1,
  startMethod: 'nursery_plant',
  stages: [
    {
      stageKey: 'stage_a',
      stageName: '阶段A（定植后1-3天）',
      order: 1,
      startOffset: 0,
      endOffset: 2,
      actions: ['action_fixture_1'],
      explanation: '定植初期',
    },
    {
      stageKey: 'stage_b',
      stageName: '阶段B（第4-6天）',
      order: 2,
      startOffset: 3,
      endOffset: 5,
      actions: ['action_fixture_2', 'action_fixture_3'],
      explanation: '缓苗期',
    },
  ],
};

const start = new Date('2026-01-01T00:00:00.000Z');

function asOf(day: number): Date {
  return new Date(Date.UTC(2026, 0, 1 + day));
}

describe('lifecycle-engine / resolveLifecycle (S2-AC-08..12)', () => {
  it('AC-08: start day -> Stage A', () => {
    const r = resolveLifecycle(template, start, asOf(0), []);
    expect(r.status).toBe('active');
    expect(r.current_stage?.stageKey).toBe('stage_a');
    expect(r.next_stage?.stageKey).toBe('stage_b');
  });

  it('AC-09: last day of Stage A (start + 2) is still Stage A', () => {
    const r = resolveLifecycle(template, start, asOf(2), []);
    expect(r.current_stage?.stageKey).toBe('stage_a');
  });

  it('AC-10: first day of Stage B (start + 3) is Stage B, not both', () => {
    const r = resolveLifecycle(template, start, asOf(3), []);
    expect(r.current_stage?.stageKey).toBe('stage_b');
    expect(r.current_stage).not.toBe(null);
    // a day belongs to exactly one stage
    expect(r.next_stage).toBeNull();
  });

  it('AC-11: before startDate -> planned, never in Stage A', () => {
    const r = resolveLifecycle(template, start, new Date('2025-12-31T00:00:00.000Z'), []);
    expect(r.status).toBe('planned');
    expect(r.current_stage).toBeNull();
    expect(r.next_stage?.stageKey).toBe('stage_a');
  });

  it('AC-12: after final stage end -> established', () => {
    const r = resolveLifecycle(template, start, asOf(6), []);
    expect(r.status).toBe('established');
    expect(r.current_stage).toBeNull();
    expect(r.warnings).toContain('本轮定植流程已完成');
  });

  it('completed_action_keys collected from events and deduped', () => {
    const r = resolveLifecycle(
      template,
      start,
      asOf(0),
      [
        { actionKey: 'action_fixture_1' },
        { actionKey: 'action_fixture_1' }, // duplicate
        { actionKey: 'made_up_action' }, // not in template
      ],
    );
    expect(r.completed_action_keys).toEqual(['action_fixture_1']);
  });

  it('empty template -> lifecycle_unavailable, no fake success', () => {
    const r = resolveLifecycle({ ...template, stages: [] }, start, asOf(0), []);
    expect(r.warnings).toContain('lifecycle_unavailable');
    expect(r.current_stage).toBeNull();
  });
});
