import { describe, expect, it } from 'vitest';
import { calculateSoilMix } from './index';
import { EngineMaterial, EngineSlot, SoilEngineInput } from './types';

// ---- synthetic DEV fixtures (program verification only) ----
const peat: EngineMaterial = { id: 'peat', name: '泥炭', functionGroup: 'base', drainage: 2, aeration: 2, waterRetention: 4, acidifying: true, costLevel: 2 };
const coco: EngineMaterial = { id: 'coco', name: '椰糠', functionGroup: 'base', drainage: 2, aeration: 3, waterRetention: 4, acidifying: false, costLevel: 1 };
const perlite: EngineMaterial = { id: 'perlite', name: '珍珠岩', functionGroup: 'drainage', drainage: 5, aeration: 4, waterRetention: 1, acidifying: false, costLevel: 1 };
const bark: EngineMaterial = { id: 'bark', name: '松鳞', functionGroup: 'organic', drainage: 4, aeration: 4, waterRetention: 2, acidifying: true, costLevel: 2 };
const vermiculite: EngineMaterial = { id: 'vermiculite', name: '蛭石', functionGroup: 'retention', drainage: 1, aeration: 2, waterRetention: 5, acidifying: false, costLevel: 2 };
const sand: EngineMaterial = { id: 'sand', name: '粗沙', functionGroup: 'drainage', drainage: 4, aeration: 3, waterRetention: 0, acidifying: false, costLevel: 1 };
const garden: EngineMaterial = { id: 'garden', name: '园土', functionGroup: 'base', drainage: 1, aeration: 1, waterRetention: 3, acidifying: false, costLevel: 1 };

const ALL = [peat, coco, perlite, bark, vermiculite, sand, garden];

const slots: EngineSlot[] = [
  { functionGroup: 'base', minPct: 40, maxPct: 60, preferredMaterials: ['peat', 'coco'], required: true },
  { functionGroup: 'drainage', minPct: 20, maxPct: 35, preferredMaterials: ['perlite'], required: true },
  { functionGroup: 'organic', minPct: 10, maxPct: 25, preferredMaterials: ['bark'], required: true },
  { functionGroup: 'retention', minPct: 0, maxPct: 15, preferredMaterials: ['vermiculite'], required: false },
];

const baseInput: SoilEngineInput = {
  slots,
  materials: ALL,
  ownedMaterialIds: [],
  cropRules: {
    peat: 'recommended', coco: 'allowed', perlite: 'recommended', bark: 'recommended',
    vermiculite: 'allowed', sand: 'caution', garden: 'avoid',
  },
  ruleReasons: { sand: '粗沙沉重易板结，比例不宜高', garden: '园土偏碱易积水，不适合蓝莓' },
  substitutions: [],
  modifiers: [],
  targets: { drainage: [3.0, 4.2], aeration: [2.8, 4.0], retention: [2.2, 3.2] },
  volumeL: 30,
  requiresAcidification: true,
};

describe('soil-engine', () => {
  it('Case 1: 用户材料齐全 → optimal，无缺料', () => {
    const r = calculateSoilMix({ ...baseInput, ownedMaterialIds: ALL.map((m) => m.id) });
    expect(r.feasibility).toBe('optimal');
    expect(r.missing).toHaveLength(0);
    expect(r.mix.length).toBeGreaterThanOrEqual(2);
    const total = r.mix.reduce((s, l) => s + l.pct, 0);
    expect(total).toBe(100);
    // all lines marked user_owned
    expect(r.mix.every((l) => l.source === 'user_owned')).toBe(true);
  });

  it('Case 2: 只有部分材料（椰糠+松鳞）→ 有解，缺料含珍珠岩', () => {
    const r = calculateSoilMix({ ...baseInput, ownedMaterialIds: ['coco', 'bark'] });
    expect(['optimal', 'substituted', 'relaxed']).toContain(r.feasibility);
    const missingIds = r.missing.map((m) => m.materialId);
    expect(missingIds).toContain('perlite');
    // owned materials are actually used
    const usedOwned = r.mix.filter((l) => l.source === 'user_owned').map((l) => l.materialId);
    expect(usedOwned).toContain('coco');
    expect(usedOwned).toContain('bark');
    expect(r.missing.some((m) => m.materialId === 'perlite')).toBe(true);
  });

  it('Case 3: 已有材料含 caution（粗沙）→ 不优先使用；若使用必有提示', () => {
    const r = calculateSoilMix({ ...baseInput, ownedMaterialIds: ['peat', 'sand', 'bark'] });
    expect(r.feasibility).toBe('optimal');
    const sandLine = r.mix.find((l) => l.materialId === 'sand');
    if (sandLine) {
      expect(r.reasons.some((x) => x.includes('粗沙'))).toBe(true);
    } else {
      // preferred behavior: perlite wins on quality, sand avoided
      expect(r.mix.some((l) => l.materialId === 'perlite')).toBe(true);
    }
  });

  it('Case 4: 已有材料含 avoid（园土）→ 硬排除，不进配方', () => {
    const r = calculateSoilMix({ ...baseInput, ownedMaterialIds: ['garden', 'peat'] });
    expect(r.mix.some((l) => l.materialId === 'garden')).toBe(false);
    expect(['optimal', 'substituted', 'relaxed']).toContain(r.feasibility);
  });

  it('Case 5: 替代材料成案 → substituted + substitutions_applied', () => {
    // drainage slot only prefers sand (caution, drainage 4); targets need >= 3.3
    // best without perlite: base 40*d2=0.8 + sand 35*d4=1.4 + bark 25*d4=1.0 = 3.2 < 3.3
    const input: SoilEngineInput = {
      ...baseInput,
      slots: [
        { functionGroup: 'base', minPct: 40, maxPct: 60, preferredMaterials: ['peat', 'coco'], required: true },
        { functionGroup: 'drainage', minPct: 20, maxPct: 35, preferredMaterials: ['sand'], required: true },
        { functionGroup: 'organic', minPct: 10, maxPct: 25, preferredMaterials: ['bark'], required: true },
        { functionGroup: 'retention', minPct: 0, maxPct: 15, preferredMaterials: ['vermiculite'], required: false },
      ],
      targets: { drainage: [3.3, 4.2], aeration: [2.8, 4.0], retention: [2.2, 3.2] },
      substitutions: [
        { fromId: 'sand', toId: 'perlite', scope: 'drainage', compatibility: 4, penalty: 1, conditions: '珍珠岩可替代粗沙提供排水' },
      ],
    };
    const r = calculateSoilMix(input);
    expect(r.feasibility).toBe('substituted');
    expect(r.substitutions_applied.length).toBeGreaterThan(0);
    expect(r.substitutions_applied[0].to).toBe('珍珠岩');
    expect(r.mix.some((l) => l.materialId === 'perlite')).toBe(true);
  });

  it('Case 6: 无可行方案 → 降级到 fallback 模板', () => {
    const input: SoilEngineInput = {
      ...baseInput,
      targets: { drainage: [3.0, 4.2], aeration: [2.8, 4.0], retention: [4.6, 5.0] }, // impossible
    };
    const r = calculateSoilMix(input);
    expect(r.feasibility).toBe('fallback');
    expect(r.mix.length).toBeGreaterThan(0);
    const total = r.mix.reduce((s, l) => s + l.pct, 0);
    expect(total).toBe(100);
    expect(r.reasons.some((x) => x.includes('参考配方'))).toBe(true);
  });

  it('Case 7: 换容器 → 配方保水/排水正确变化', () => {
    const ownedAll = ALL.map((m) => m.id);
    const fabric = calculateSoilMix(
      {
        ...baseInput,
        ownedMaterialIds: ownedAll,
        modifiers: [
          { adjustTarget: 'water_retention', delta: 2, directionHint: { increase_group: 'retention', decrease_group: 'drainage' } },
        ],
      },
      '无纺布美植袋',
    );
    const plastic = calculateSoilMix(
      {
        ...baseInput,
        ownedMaterialIds: ownedAll,
        modifiers: [
          { adjustTarget: 'drainage', delta: 1, directionHint: { increase_group: 'drainage', decrease_group: 'retention' } },
          { adjustTarget: 'water_retention', delta: -1, directionHint: { increase_group: 'drainage', decrease_group: 'retention' } },
        ],
      },
      '塑料盆',
    );
    expect(fabric.feasibility).toBe('optimal');
    expect(plastic.feasibility).toBe('optimal');
    // fabric bag dries out: recipe retains more water
    expect(fabric.water_retention_score).toBeGreaterThan(plastic.water_retention_score);
    // plastic pot drains poorly: recipe drains more
    expect(plastic.drainage_score).toBeGreaterThan(fabric.drainage_score);
    // modifier reasons are user-readable
    expect(fabric.reasons.some((r) => r.includes('无纺布美植袋') && r.includes('保水'))).toBe(true);
    expect(plastic.reasons.some((r) => r.includes('塑料盆') && r.includes('排水'))).toBe(true);
  });

  it('V10: requires_acidification → 必带 pH 管理提醒，不含 pH 计算值', () => {
    const r = calculateSoilMix({ ...baseInput, ownedMaterialIds: ALL.map((m) => m.id), phManagementNote: '蓝莓喜酸，pH 管理建议见种植指南' });
    expect(r.ph_management_note).toBeTruthy();
    expect(r.ph_management_note).toContain('pH');
    // acidifying materials present (peat+bark) → no extra acidification flag
    expect(r.need_acidification).toBe(false);
  });

  it('酸性材料不足时 need_acidification=true', () => {
    // only coco (non-acidifying) as base preferred, no bark in organic slot
    const input: SoilEngineInput = {
      ...baseInput,
      slots: [
        { functionGroup: 'base', minPct: 40, maxPct: 60, preferredMaterials: ['coco'], required: true },
        { functionGroup: 'drainage', minPct: 20, maxPct: 35, preferredMaterials: ['perlite'], required: true },
        { functionGroup: 'organic', minPct: 10, maxPct: 25, preferredMaterials: [], required: false },
        { functionGroup: 'retention', minPct: 0, maxPct: 15, preferredMaterials: ['vermiculite'], required: false },
      ],
    };
    const r = calculateSoilMix(input);
    expect(r.need_acidification).toBe(true);
    expect(r.reasons.some((x) => x.includes('调酸'))).toBe(true);
  });
});
