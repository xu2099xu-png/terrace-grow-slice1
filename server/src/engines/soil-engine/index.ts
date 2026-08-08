import { groupLabel, prepare, solve, enumerateCompositions } from './solver';
import {
  EngineSlot,
  MissingLine,
  MixLine,
  SoilEngineInput,
  SoilResult,
  SubstitutionApplied,
} from './types';

export * from './types';
export { applyModifiers, enumerateCompositions, generateCandidates, prepare, solve } from './solver';

function round5(v: number): number {
  return Math.round(v / 5) * 5;
}

/** L3 fallback: build the reviewed template's default mix from slot midpoints.
 *  NOTE: This is kept as a last-resort template path (L4 unavailable).
 *  It still respects avoid/hard constraints by using the solver's candidate pool.
 */
function fallbackMix(ctx: ReturnType<typeof prepare>, slots: EngineSlot[], forbiddenPairs: [string, string][] = []) {
  // Use the solver's wide-target pass (L3) instead of raw template assembly.
  const wideTargets = { drainage: [0, 5] as [number, number], aeration: [0, 5] as [number, number], retention: [0, 5] as [number, number] };
  const pool = [...ctx.candidates, ...ctx.substitutionCandidates];
  const comps = enumerateCompositions(ctx, pool);
  const feasible: any[] = [];
  for (const c of comps) {
    let d = 0, a = 0, w = 0, ownedPct = 0, cautionPct = 0, subPenalty = 0, missing = 0, nonZero = 0;
    const ids = [...c.keys()];
    let banned = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (forbiddenPairs.some(([x, y]) => (x === ids[i] && y === ids[j]) || (x === ids[j] && y === ids[i]))) {
          banned = true; break;
        }
      }
      if (banned) break;
    }
    if (banned) continue;
    for (const [id, pct] of c) {
      const m = ctx.byId.get(id);
      if (!m) continue;
      d += (pct * m.drainage) / 100;
      a += (pct * m.aeration) / 100;
      w += (pct * m.waterRetention) / 100;
      if (ctx.owned.has(id)) ownedPct += pct;
      else missing++;
      if (ctx.caution.has(id)) cautionPct += pct;
      subPenalty += (pct * (ctx.subPenaltyOf.get(id) ?? 0)) / 100;
      nonZero++;
    }
    const quality = subPenalty + ctx.config.cautionPenalty * (cautionPct / 100);
    feasible.push({ comp: c, drainage: d, aeration: a, retention: w, quality, convenience: ownedPct / 100, missingCount: missing, nonZeroCount: nonZero, cautionShare: cautionPct / 100 });
  }
  if (feasible.length === 0) return null;
  feasible.sort((x: any, y: any) => x.quality - y.quality);
  const topK = feasible.slice(0, ctx.config.topK);
  const bestConv = Math.max(...topK.map((f: any) => f.convenience));
  const convBand = topK.filter((f: any) => f.convenience >= bestConv - ctx.config.convenienceTolerance);
  convBand.sort((x: any, y: any) => x.missingCount - y.missingCount || x.nonZeroCount - y.nonZeroCount || x.quality - y.quality);
  return convBand[0]?.comp ?? null;
}

export function calculateSoilMix(input: SoilEngineInput, containerName?: string): SoilResult {
  const ctx = prepare(input, containerName);
  const reasons: string[] = [...ctx.modifierReasons];
  const outcome = solve(ctx, input.forbiddenPairs ?? []);

  let comp: Map<string, number> | null;
  let feasibility: SoilResult['feasibility'];
  let usedSubs: string[] = [];

  if (outcome.status === 'solved' && outcome.best) {
    comp = outcome.best.comp;
    feasibility = outcome.feasibility!;
    usedSubs = outcome.usedSubstitutionIds;
    if (feasibility === 'substituted') {
      reasons.push('部分首选材料不可得，已按替代规则调整方案');
    } else if (feasibility === 'relaxed') {
      reasons.push('理想区间无可行解，已放宽一档，配方接近理想状态');
    } else if (feasibility === 'fallback') {
      reasons.push('按标准参考配方给出方案，请按缺料清单备齐材料');
    }
  } else {
    // L4: never fabricate
    return {
      mix: [],
      missing: [],
      substitutions_applied: [],
      need_acidification: input.requiresAcidification,
      ph_management_note: input.phManagementNote ?? null,
      feasibility: 'unavailable',
      water_retention_score: 0,
      drainage_score: 0,
      aeration_score: 0,
      reasons: ['配土数据维护中，暂时无法生成方案'],
    };
  }

  const mix: MixLine[] = [];
  const missing: MissingLine[] = [];
  let acidPct = 0;
  let d = 0,
    a = 0,
    w = 0;
  for (const [id, pct] of comp) {
    const m = ctx.byId.get(id)!;
    const liters = Math.round(((pct / 100) * input.volumeL) * 10) / 10;
    const owned = ctx.owned.has(id);
    mix.push({
      materialId: id,
      material: m.name,
      pct,
      liters,
      source: owned ? 'user_owned' : 'to_purchase',
    });
    if (!owned) {
      missing.push({
        materialId: id,
        material: m.name,
        liters,
        reason: `${groupLabel(m.functionGroup)}材料不足`,
      });
    }
    if (m.acidifying) acidPct += pct;
    d += (pct * m.drainage) / 100;
    a += (pct * m.aeration) / 100;
    w += (pct * m.waterRetention) / 100;
  }
  mix.sort((x, y) => y.pct - x.pct);

  // caution materials used -> surface the rule reason
  for (const line of mix) {
    if (ctx.caution.has(line.materialId)) {
      const ruleReason = input.ruleReasons?.[line.materialId];
      reasons.push(ruleReason ?? `${line.material}需谨慎使用，注意比例`);
    }
  }

  const substitutions_applied: SubstitutionApplied[] = usedSubs.map((toId) => {
    const from = ctx.subFromOf.get(toId);
    const to = ctx.byId.get(toId)!;
    return {
      from: from?.name ?? '',
      to: to.name,
      scope: to.functionGroup,
      note: input.substitutions.find((s) => s.toId === toId)?.conditions ?? undefined,
    };
  });

  // v1.4: no mathematical pH constraint. Acidification note comes from caller (crop-aware).
  const needAcid = input.requiresAcidification && acidPct === 0;
  if (needAcid) {
    reasons.push('配方中缺乏酸性材料，建议额外调酸');
  }

  return {
    mix,
    missing,
    substitutions_applied,
    need_acidification: needAcid,
    ph_management_note: input.phManagementNote ?? null,
    feasibility,
    water_retention_score: Math.round(w * 100) / 100,
    drainage_score: Math.round(d * 100) / 100,
    aeration_score: Math.round(a * 100) / 100,
    reasons,
  };
}
