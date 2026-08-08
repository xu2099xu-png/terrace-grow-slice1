import {
  Composition,
  DEFAULT_CONFIG,
  EngineConfig,
  EngineMaterial,
  EngineModifier,
  EngineSlot,
  FunctionGroup,
  PropertyTargets,
  SoilEngineInput,
} from './types';

export interface PreparedContext {
  config: EngineConfig;
  slots: EngineSlot[]; // bounds after container modifier adjustment
  targets: PropertyTargets; // after container modifier adjustment
  candidates: EngineMaterial[]; // initial candidate set (no substitution-only materials)
  substitutionCandidates: EngineMaterial[]; // only reachable via MaterialSubstitution
  owned: Set<string>;
  caution: Set<string>;
  avoid: Set<string>;
  modifierReasons: string[];
  byId: Map<string, EngineMaterial>;
  slotOf: Map<string, EngineSlot>; // materialId -> slot (by function group)
  subPenaltyOf: Map<string, number>; // substitution to-material -> penalty
  subFromOf: Map<string, EngineMaterial>; // substitution to-material -> from-material
  subCompatibilityOf: Map<string, number>; // substitution to-material -> compatibility (1-5)
  requiresAcidification: boolean;
  fallbackTemplate?: { slots: EngineSlot[]; targets: PropertyTargets };
}

const GROUP_LABEL: Record<FunctionGroup, string> = {
  base: '基础基质',
  drainage: '排水',
  retention: '保水',
  organic: '有机质',
};

export function groupLabel(g: FunctionGroup): string {
  return GROUP_LABEL[g] ?? g;
}

/** Apply ContainerModifiers: shift property targets and nudge slot bounds. */
export function applyModifiers(
  slots: EngineSlot[],
  targets: PropertyTargets,
  modifiers: EngineModifier[],
  containerName?: string,
): { slots: EngineSlot[]; targets: PropertyTargets; reasons: string[] } {
  const outSlots = slots.map((s) => ({ ...s }));
  const outTargets: PropertyTargets = {
    drainage: [...targets.drainage] as [number, number],
    aeration: [...targets.aeration] as [number, number],
    retention: [...targets.retention] as [number, number],
  };
  const reasons: string[] = [];
  const clamp = (v: number) => Math.min(5, Math.max(0.5, v));

  for (const m of modifiers) {
    const key =
      m.adjustTarget === 'water_retention'
        ? 'retention'
        : m.adjustTarget === 'drainage'
          ? 'drainage'
          : 'aeration';
    const shift = m.delta * 0.4; // container level point -> property score shift
    outTargets[key] = [clamp(outTargets[key][0] + shift), clamp(outTargets[key][1] + shift)];

    const hint = m.directionHint;
    if (hint?.increase_group) {
      const slot = outSlots.find((s) => s.functionGroup === hint.increase_group);
      if (slot) slot.minPct = Math.min(slot.maxPct, slot.minPct + 5);
    }
    if (hint?.decrease_group) {
      const slot = outSlots.find((s) => s.functionGroup === hint.decrease_group);
      if (slot) slot.maxPct = Math.max(slot.minPct, slot.maxPct - 5);
    }
    if (containerName) {
      if (m.adjustTarget === 'water_retention' && m.delta > 0) {
        reasons.push(`${containerName}失水快，保水材料已上调`);
      } else if (m.adjustTarget === 'water_retention' && m.delta < 0) {
        reasons.push(`${containerName}保水强，保水材料已下调`);
      } else if (m.adjustTarget === 'drainage' && m.delta > 0) {
        reasons.push(`${containerName}排水偏弱，排水材料已上调`);
      } else if (m.adjustTarget === 'drainage' && m.delta < 0) {
        reasons.push(`${containerName}排水好，排水材料已下调`);
      }
    }
  }
  return { slots: outSlots, targets: outTargets, reasons };
}

/**
 * Candidate set (v1.4 §5.1):
 *   slot.preferred_materials ∪ owned materials (function group matched to a slot)
 *   − crop rule 'avoid' materials (hard exclusion)
 * Substitution-reachable materials are kept aside and only join at fallback L1.
 */
export function generateCandidates(input: SoilEngineInput): {
  candidates: EngineMaterial[];
  substitutionCandidates: EngineMaterial[];
  subPenaltyOf: Map<string, number>;
  subFromOf: Map<string, EngineMaterial>;
  subCompatibilityOf: Map<string, number>;
} {
  const byId = new Map(input.materials.map((m) => [m.id, m]));
  const slotGroups = new Set(input.slots.map((s) => s.functionGroup));
  const preferred = new Set<string>();
  for (const s of input.slots) for (const id of s.preferredMaterials) preferred.add(id);

  const owned = new Set(input.ownedMaterialIds);
  const avoid = new Set(
    Object.entries(input.cropRules)
      .filter(([, lvl]) => lvl === 'avoid')
      .map(([id]) => id),
  );

  const initial = new Set<string>();
  for (const id of preferred) initial.add(id);
  for (const id of owned) {
    const m = byId.get(id);
    if (m && slotGroups.has(m.functionGroup)) initial.add(id);
  }
  for (const id of avoid) initial.delete(id);

  // substitution reachable (to-materials), scope must match a slot group
  const subTo = new Map<string, { penalty: number; fromId: string; compatibility: number }>();
  for (const sub of input.substitutions) {
    if (!slotGroups.has(sub.scope)) continue;
    if (avoid.has(sub.toId)) continue;
    // only relevant if the from-material is in the initial candidate set
    if (!initial.has(sub.fromId)) continue;
    const prev = subTo.get(sub.toId);
    if (!prev || sub.penalty < prev.penalty) {
      subTo.set(sub.toId, { penalty: sub.penalty, fromId: sub.fromId, compatibility: sub.compatibility });
    }
  }

  const candidates = [...initial].map((id) => byId.get(id)!).filter(Boolean);
  const substitutionCandidates = [...subTo.keys()]
    .filter((id) => !initial.has(id))
    .map((id) => byId.get(id)!)
    .filter(Boolean);

  const subPenaltyOf = new Map<string, number>();
  const subFromOf = new Map<string, EngineMaterial>();
  const subCompatibilityOf = new Map<string, number>();
  for (const [toId, info] of subTo) {
    subPenaltyOf.set(toId, info.penalty);
    subCompatibilityOf.set(toId, info.compatibility);
    const from = byId.get(info.fromId);
    if (from) subFromOf.set(toId, from);
  }
  return { candidates, substitutionCandidates, subPenaltyOf, subFromOf, subCompatibilityOf };
}

export function prepare(input: SoilEngineInput, containerName?: string): PreparedContext {
  const config: EngineConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const { slots, targets, reasons } = applyModifiers(
    input.slots,
    input.targets,
    input.modifiers,
    containerName,
  );
  const { candidates, substitutionCandidates, subPenaltyOf, subFromOf, subCompatibilityOf } = generateCandidates(input);
  const byId = new Map(input.materials.map((m) => [m.id, m]));
  const slotOf = new Map<string, EngineSlot>();
  for (const m of [...candidates, ...substitutionCandidates]) {
    const slot = slots.find((s) => s.functionGroup === m.functionGroup);
    if (slot) slotOf.set(m.id, slot);
  }
  return {
    config,
    slots,
    targets,
    candidates,
    substitutionCandidates,
    owned: new Set(input.ownedMaterialIds),
    caution: new Set(
      Object.entries(input.cropRules)
        .filter(([, l]) => l === 'caution')
        .map(([id]) => id),
    ),
    avoid: new Set(
      Object.entries(input.cropRules)
        .filter(([, l]) => l === 'avoid')
        .map(([id]) => id),
    ),
    modifierReasons: reasons,
    byId,
    slotOf,
    subPenaltyOf,
    subFromOf,
    subCompatibilityOf,
    requiresAcidification: input.requiresAcidification,
    fallbackTemplate: input.fallbackTemplate,
  };
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Enumerate compositions (H1: sum=100) at config.stepPct granularity.
 * Two-phase: distribute slot totals within [minPct, maxPct] (H2/H6 by construction),
 * then split each slot total among its candidate materials.
 */
export function enumerateCompositions(ctx: PreparedContext, pool: EngineMaterial[]): Composition[] {
  const { config, slots } = ctx;
  const step = config.stepPct;
  const bySlot = new Map<FunctionGroup, EngineMaterial[]>();
  for (const m of pool) {
    if (!bySlot.has(m.functionGroup)) bySlot.set(m.functionGroup, []);
    bySlot.get(m.functionGroup)!.push(m);
  }
  // slots with no candidate materials: required slot -> no solution possible
  const activeSlots = slots.filter((s) => (bySlot.get(s.functionGroup) ?? []).length > 0);
  if (slots.some((s) => s.required && (bySlot.get(s.functionGroup) ?? []).length === 0)) {
    return [];
  }

  const results: Composition[] = [];

  // phase 1: slot totals
  const slotTotals: number[][] = [];
  const walk = (idx: number, acc: number[], remaining: number) => {
    if (idx === activeSlots.length) {
      if (Math.abs(remaining) < 1e-9) slotTotals.push([...acc]);
      return;
    }
    const s = activeSlots[idx];
    const isLast = idx === activeSlots.length - 1;
    for (const v of range(s.minPct, s.maxPct, step)) {
      if (v > remaining + 1e-9) break;
      if (isLast && Math.abs(v - remaining) > 1e-9) continue;
      acc.push(v);
      walk(idx + 1, acc, Math.round((remaining - v) * 100) / 100);
      acc.pop();
    }
  };
  walk(0, [], 100);

  // phase 2: split each slot total among its materials
  const splitSlot = (mats: EngineMaterial[], total: number): number[][] => {
    const out: number[][] = [];
    const walk2 = (idx: number, acc: number[], remaining: number) => {
      if (idx === mats.length) {
        if (Math.abs(remaining) < 1e-9) out.push([...acc]);
        return;
      }
      const isLast = idx === mats.length - 1;
      if (isLast) {
        if (remaining % step === 0 && remaining >= 0) {
          acc.push(remaining);
          out.push([...acc]);
          acc.pop();
        }
        return;
      }
      for (const v of range(0, remaining, step)) {
        acc.push(v);
        walk2(idx + 1, acc, Math.round((remaining - v) * 100) / 100);
        acc.pop();
      }
    };
    if (total === 0) return [mats.map(() => 0)];
    walk2(0, [], total);
    return out;
  };

  const combine = (
    slotIdx: number,
    totals: number[],
    acc: Composition,
    nonZero: number,
  ) => {
    if (slotIdx === activeSlots.length) {
      if (nonZero >= 1 && nonZero <= ctx.config.maxNonZeroMaterials) {
        results.push(new Map(acc));
      }
      return;
    }
    const s = activeSlots[slotIdx];
    const mats = bySlot.get(s.functionGroup)!;
    const total = totals[slotIdx];
    if (s.required && total < s.minPct - 1e-9) return; // H6
    for (const split of splitSlot(mats, total)) {
      let added = 0;
      const touched: string[] = [];
      split.forEach((v, i) => {
        if (v > 0) {
          acc.set(mats[i].id, v);
          touched.push(mats[i].id);
          added++;
        }
      });
      combine(slotIdx + 1, totals, acc, nonZero + added);
      for (const id of touched) acc.delete(id);
    }
  };
  for (const totals of slotTotals) combine(0, totals, new Map(), 0);
  return results;
}

export interface ScoredComposition {
  comp: Composition;
  drainage: number;
  aeration: number;
  retention: number;
  quality: number;
  convenience: number;
  missingCount: number;
  nonZeroCount: number;
  cautionShare: number;
}

/** H3-H5 property ranges + H7 forbidden pairs; then Layer-2 quality score. */
export function evaluate(
  comp: Composition,
  ctx: PreparedContext,
  targets: PropertyTargets,
  forbiddenPairs: [string, string][],
): ScoredComposition | null {
  let d = 0,
    a = 0,
    w = 0,
    ownedPct = 0,
    cautionPct = 0,
    subPenalty = 0,
    acidPct = 0,
    missing = 0,
    nonZero = 0;
  const ids = [...comp.keys()];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const banned = forbiddenPairs.some(
        ([x, y]) => (x === ids[i] && y === ids[j]) || (x === ids[j] && y === ids[i]),
      );
      if (banned) return null; // H7
    }
  }
  for (const [id, pct] of comp) {
    const m = ctx.byId.get(id);
    if (!m) return null;
    d += (pct * m.drainage) / 100;
    a += (pct * m.aeration) / 100;
    w += (pct * m.waterRetention) / 100;
    if (ctx.owned.has(id)) ownedPct += pct;
    else missing++;
    if (ctx.caution.has(id)) cautionPct += pct;
    if (m.acidifying) acidPct += pct;
    const penalty = ctx.subPenaltyOf.get(id) ?? 0;
    const compatibility = ctx.subCompatibilityOf.get(id) ?? 1;
    subPenalty += (pct * (penalty / Math.max(1, compatibility))) / 100;
    nonZero++;
  }
  const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo - 1e-9 && v <= hi + 1e-9;
  if (!inRange(d, targets.drainage)) return null; // H3
  if (!inRange(a, targets.aeration)) return null; // H4
  if (!inRange(w, targets.retention)) return null; // H5

  const center = ([lo, hi]: [number, number]) => (lo + hi) / 2;
  const dist = Math.sqrt(
    (d - center(targets.drainage)) ** 2 +
      (a - center(targets.aeration)) ** 2 +
      (w - center(targets.retention)) ** 2,
  );
  const quality =
    dist + ctx.config.cautionPenalty * (cautionPct / 100) + ctx.config.substitutionPenalty * subPenalty;

  return {
    comp,
    drainage: d,
    aeration: a,
    retention: w,
    quality,
    convenience: ownedPct / 100,
    missingCount: missing,
    nonZeroCount: nonZero,
    cautionShare: cautionPct / 100,
  };
}

function widen([lo, hi]: [number, number]): [number, number] {
  const width = hi - lo;
  const pad = width * 0.5 + 0.3;
  return [Math.max(0, lo - pad), Math.min(5, hi + pad)];
}

/**
 * Layered selection (v1.4 §5.3):
 *  L2 quality -> top K; L3 maximize owned usage; L4 fewest missing kinds; L5 simplest recipe.
 */
export function selectBest(feasible: ScoredComposition[], ctx: PreparedContext): ScoredComposition | null {
  if (feasible.length === 0) return null;
  const byQuality = [...feasible].sort((x, y) => x.quality - y.quality);
  const topK = byQuality.slice(0, ctx.config.topK);
  const bestConv = Math.max(...topK.map((f) => f.convenience));
  const convBand = topK.filter((f) => f.convenience >= bestConv - ctx.config.convenienceTolerance);
  convBand.sort(
    (x, y) =>
      x.missingCount - y.missingCount ||
      x.nonZeroCount - y.nonZeroCount ||
      x.quality - y.quality,
  );
  return convBand[0];
}

export interface SolveOutcome {
  status: 'solved' | 'unsolved';
  feasibility?: 'optimal' | 'substituted' | 'relaxed' | 'fallback';
  best?: ScoredComposition;
  usedSubstitutionIds: string[];
  relaxedTargets?: PropertyTargets;
}

/** One solve pass over a candidate pool. */
function solvePass(
  ctx: PreparedContext,
  pool: EngineMaterial[],
  targets: PropertyTargets,
  forbiddenPairs: [string, string][],
): ScoredComposition | null {
  const comps = enumerateCompositions(ctx, pool);
  const feasible: ScoredComposition[] = [];
  for (const c of comps) {
    const ev = evaluate(c, ctx, targets, forbiddenPairs);
    if (ev) feasible.push(ev);
  }
  return selectBest(feasible, ctx);
}

/**
 * Solve with the L1-L4 degradation ladder (v1.4 §5.4).
 * L3/L4 (fallback template / unavailable) are handled by the caller,
 * which owns template knowledge; this returns the best of L0/L1/L2.
 */
export function solve(ctx: PreparedContext, forbiddenPairs: [string, string][] = []): SolveOutcome {
  // L0: initial candidate set
  const l0 = solvePass(ctx, ctx.candidates, ctx.targets, forbiddenPairs);
  if (l0) return { status: 'solved', feasibility: 'optimal', best: l0, usedSubstitutionIds: [] };

  // L1: open substitution materials
  if (ctx.substitutionCandidates.length > 0) {
    const pool = [...ctx.candidates, ...ctx.substitutionCandidates];
    const l1 = solvePass(ctx, pool, ctx.targets, forbiddenPairs);
    if (l1) {
      return {
        status: 'solved',
        feasibility: 'substituted',
        best: l1,
        usedSubstitutionIds: [...l1.comp.keys()].filter((id) => ctx.subPenaltyOf.has(id)),
      };
    }
  }

  // L2: relax property targets one notch
  const relaxed: PropertyTargets = {
    drainage: widen(ctx.targets.drainage),
    aeration: widen(ctx.targets.aeration),
    retention: widen(ctx.targets.retention),
  };
  const pool = [...ctx.candidates, ...ctx.substitutionCandidates];
  const l2 = solvePass(ctx, pool, relaxed, forbiddenPairs);
  if (l2) {
    return {
      status: 'solved',
      feasibility: 'relaxed',
      best: l2,
      usedSubstitutionIds: [...l2.comp.keys()].filter((id) => ctx.subPenaltyOf.has(id)),
      relaxedTargets: relaxed,
    };
  }
  // L3: use reviewed fallback template with its own slot bounds and targets
  if (ctx.fallbackTemplate) {
    const fbCtx: PreparedContext = {
      ...ctx,
      slots: ctx.fallbackTemplate.slots,
      targets: ctx.fallbackTemplate.targets,
    };
    const l3 = solvePass(fbCtx, pool, ctx.fallbackTemplate.targets, forbiddenPairs);
    if (l3) {
      return {
        status: 'solved',
        feasibility: 'fallback',
        best: l3,
        usedSubstitutionIds: [...l3.comp.keys()].filter((id) => ctx.subPenaltyOf.has(id)),
      };
    }
  }

  return { status: 'unsolved', usedSubstitutionIds: [] };
}
