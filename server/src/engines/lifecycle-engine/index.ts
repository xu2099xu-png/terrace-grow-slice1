/**
 * lifecycle-engine — pure functions. No NestJS / Prisma / Date-format deps.
 * Resolves the current lifecycle stage for a planting from the pinned
 * template, the planting start date, an as-of date, and completed events.
 *
 * Contract: S2-AC-08..12. Date boundaries live ONLY here — controllers and H5
 * must not re-derive the current stage.
 */

export interface LifecycleStageRow {
  stageKey: string;
  stageName: string;
  order: number;
  startOffset: number; // days from startDate
  endOffset: number; // inclusive
  actions: string[];
  explanation?: string | null;
}

export interface LifecycleTemplateRow {
  id: string;
  version: number;
  startMethod: string;
  stages: LifecycleStageRow[];
}

export interface LifecycleEvent {
  actionKey: string;
}

export type LifecycleStatus =
  | 'planned' // before startDate (S2-AC-11)
  | 'active' // within a stage (S2-AC-08..10)
  | 'established'; // past final stage end (S2-AC-12)

export interface LifecycleResolution {
  status: LifecycleStatus;
  current_stage: LifecycleStageRow | null;
  next_stage: LifecycleStageRow | null;
  completed_action_keys: string[];
  warnings: string[];
}

/** Convert a Date to the calendar date in Asia/Shanghai (yyyy-mm-dd). */
function toShanghaiDate(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month') - 1, day: get('day') };
}

/** Day difference based on Asia/Shanghai calendar dates (not UTC calendar). */
export function dayDiff(start: Date, asOf: Date): number {
  const a = toShanghaiDate(start);
  const b = toShanghaiDate(asOf);
  const da = Date.UTC(a.y, a.m, a.day);
  const db = Date.UTC(b.y, b.m, b.day);
  return Math.round((db - da) / 86400000);
}

/**
 * Resolve the lifecycle state.
 * @param template  pinned lifecycle template (governed stages already applied)
 * @param startDate planting start date (00:00)
 * @param asOfDate  evaluation date (00:00)
 * @param events    user-completed actions
 */
export function resolveLifecycle(
  template: LifecycleTemplateRow,
  startDate: Date,
  asOfDate: Date,
  events: LifecycleEvent[],
): LifecycleResolution {
  if (!template || !Array.isArray(template.stages) || template.stages.length === 0) {
    return {
      status: 'active',
      current_stage: null,
      next_stage: null,
      completed_action_keys: [],
      warnings: ['lifecycle_unavailable'],
    };
  }

  const diff = dayDiff(startDate, asOfDate);

  // Before planting starts: planned, never in a stage (S2-AC-11).
  if (diff < 0) {
    return {
      status: 'planned',
      current_stage: null,
      next_stage: template.stages[0],
      completed_action_keys: [],
      warnings: [],
    };
  }

  const sorted = [...template.stages].sort((x, y) => x.order - y.order);
  const finalStage = sorted[sorted.length - 1];

  // Past the final stage's inclusive end: the Slice-2 first-planting flow is
  // complete (S2-AC-12). Not "no longer needs care" — just Slice-2 scope ends.
  if (diff > finalStage.endOffset) {
    return {
      status: 'established',
      current_stage: null,
      next_stage: null,
      completed_action_keys: collectCompleted(sorted, events),
      warnings: ['本轮定植流程已完成'],
    };
  }

  // Within [0, finalStage.endOffset]: exactly one stage owns the day.
  // A day belongs to stage N iff startOffset(N) <= diff <= endOffset(N).
  const current = sorted.find(
    (s) => diff >= s.startOffset && diff <= s.endOffset,
  );
  const currentStage = current ?? null;
  const nextStage = current
    ? sorted.find((s) => s.order > current.order) ?? null
    : null;

  const completed = collectCompleted(sorted, events);
  const warnings: string[] = [];
  if (currentStage && nextStage) {
    warnings.push(`下一阶段：${nextStage.stageName}`);
  }
  return {
    status: 'active',
    current_stage: currentStage,
    next_stage: nextStage,
    completed_action_keys: completed,
    warnings,
  };
}

/** All action keys from events that exist in the template's stages (dedup). */
function collectCompleted(
  stages: LifecycleStageRow[],
  events: LifecycleEvent[],
): string[] {
  const known = new Set<string>();
  for (const s of stages) for (const a of s.actions) known.add(a);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of events) {
    if (known.has(e.actionKey) && !seen.has(e.actionKey)) {
      seen.add(e.actionKey);
      out.push(e.actionKey);
    }
  }
  return out;
}
