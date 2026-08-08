import { groupLabel, prepare, solve } from './solver';
import {
  MissingLine,
  MixLine,
  SoilEngineInput,
  SoilResult,
  SubstitutionApplied,
} from './types';

export * from './types';
export { applyModifiers, enumerateCompositions, generateCandidates, prepare, solve } from './solver';

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
      has_acidifying_component: false,
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

  // v1.4: no mathematical pH constraint. `has_acidifying_component` is a pure
  // fact field (does the chosen mix contain any acidifying material?). We do
  // NOT derive "acid management is handled" from mere presence of acidifying
  // material; the crop-aware `ph_management_note` (passed by the caller) is
  // shown whenever the crop requires acidification.
  const has_acidifying_component = acidPct > 0;
  if (input.requiresAcidification && !has_acidifying_component) {
    reasons.push('配方中不含酸性材料');
  }

  return {
    mix,
    missing,
    substitutions_applied,
    has_acidifying_component,
    ph_management_note: input.phManagementNote ?? null,
    feasibility,
    water_retention_score: Math.round(w * 100) / 100,
    drainage_score: Math.round(d * 100) / 100,
    aeration_score: Math.round(a * 100) / 100,
    reasons,
  };
}
