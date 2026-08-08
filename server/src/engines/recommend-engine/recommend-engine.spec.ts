import { describe, expect, it } from 'vitest';
import { recommendContainer, selectRequirement, ContainerRequirementRow } from './container';
import { assessSunlight, estimateSunlightFromRules, SunEstimateRuleRow } from './sunlight';
import { rankVarieties, resolvePollination, VarietyInput } from './varieties';
import { assessWaterRisk, WaterRiskConfigRow } from './water-risk';

// sunlight estimate rules (mirror of seed DEV_FIXTURE rows)
const rules: SunEstimateRuleRow[] = [
  { orientation: 'north', timeObs: 'rarely', level: 'LOW', hoursMin: 0, hoursMax: 1, confidence: 'medium' },
  { orientation: 'north', timeObs: 'unknown', level: 'LOW', hoursMin: 0, hoursMax: 3, confidence: 'low' },
  { orientation: 'north', timeObs: 'morning', level: 'LOW', hoursMin: 0, hoursMax: 2, confidence: 'medium' },
  { orientation: 'south', timeObs: 'allday', level: 'LONG', hoursMin: 6, hoursMax: 9, confidence: 'medium' },
  { orientation: 'unknown', timeObs: 'unknown', level: 'UNKNOWN', hoursMin: 2, hoursMax: 6, confidence: 'low' },
];

const BLUEBERRY_MIN_SUN = 6;

describe('recommend-engine / sunlight 四态判定', () => {
  it('V1: 直答"半天左右"(4-6h) vs 需求6h → BORDERLINE + "日照可能稍少"', () => {
    const r = assessSunlight({ hoursMin: 4, hoursMax: 6, confidence: 'medium' }, BLUEBERRY_MIN_SUN);
    expect(r.status).toBe('BORDERLINE');
    expect(r.weight).toBeCloseTo(0.8);
    expect(r.message).toBe('日照可能稍少');
  });

  it('V2: 直答"大部分白天"(6-9h) → MATCH', () => {
    const r = assessSunlight({ hoursMin: 6, hoursMax: 9, confidence: 'medium' }, BLUEBERRY_MIN_SUN);
    expect(r.status).toBe('MATCH');
    expect(r.weight).toBe(1);
    expect(r.message).toBeNull();
  });

  it('V3: "不确定"→北向→基本晒不到(0-2h low) → LIKELY_NO_MATCH，不过滤', () => {
    const est = estimateSunlightFromRules('north', 'unknown', rules)!;
    expect(est.hoursMax).toBeLessThan(BLUEBERRY_MIN_SUN);
    const r = assessSunlight(
      { hoursMin: est.hoursMin, hoursMax: est.hoursMax, confidence: est.confidence },
      BLUEBERRY_MIN_SUN,
    );
    expect(r.status).toBe('LIKELY_NO_MATCH');
    expect(r.weight).toBeCloseTo(0.4);
    expect(r.weight).toBeGreaterThan(0); // never hard-filtered
    expect(r.message).toContain('建议先确认');
  });

  it('V4: "不确定"→两问都不知道 → 2-6h low → BORDERLINE + "建议先观察"', () => {
    const est = estimateSunlightFromRules('unknown', 'unknown', rules)!;
    expect([est.hoursMin, est.hoursMax]).toEqual([2, 6]);
    expect(est.confidence).toBe('low');
    const r = assessSunlight(
      { hoursMin: est.hoursMin, hoursMax: est.hoursMax, confidence: est.confidence },
      BLUEBERRY_MIN_SUN,
    );
    expect(r.status).toBe('BORDERLINE');
    expect(r.weight).toBeCloseTo(0.8 * 0.9);
    expect(r.message).toBe('日照不确定，建议先观察');
  });

  it('用户明确说日照不足(0-2h medium) → NO_MATCH 硬过滤', () => {
    const r = assessSunlight({ hoursMin: 0, hoursMax: 2, confidence: 'medium' }, BLUEBERRY_MIN_SUN);
    expect(r.status).toBe('NO_MATCH');
    expect(r.weight).toBe(0);
  });
});

const varieties: VarietyInput[] = [
  { id: 'oneal', name: '奥尼尔', maturePeriod: 'early', plantHabit: 'standard', containerFit: 4, traits: { chill_hours_min: 300, heat_tolerance: 4, shade_tolerance: 2 } },
  { id: 'misty', name: '薄雾', maturePeriod: 'mid', plantHabit: 'standard', containerFit: 4, traits: { chill_hours_min: 250, heat_tolerance: 4, shade_tolerance: 2 } },
  { id: 'northblue', name: '北蓝', maturePeriod: 'late', plantHabit: 'compact', containerFit: 5, traits: { chill_hours_min: 900, heat_tolerance: 2, shade_tolerance: 3 } },
];

describe('recommend-engine / 品种排序', () => {
  it('华南(低需冷/炎热)：南高丛品种排前，北蓝被惩罚', () => {
    const ranked = rankVarieties(
      varieties,
      { chillHoursEstimate: 300, heatLevel: 5 },
      { status: 'MATCH', weight: 1 },
    );
    expect(ranked[ranked.length - 1].varietyId).toBe('northblue');
    const nb = ranked.find((r) => r.varietyId === 'northblue')!;
    expect(nb.reasons.some((x) => x.includes('需冷量'))).toBe(true);
    expect(nb.reasons.some((x) => x.includes('耐热'))).toBe(true);
  });

  it('华北(高需冷)：北蓝排名上升', () => {
    const ranked = rankVarieties(
      varieties,
      { chillHoursEstimate: 1200, heatLevel: 3 },
      { status: 'MATCH', weight: 1 },
    );
    const nb = ranked.find((r) => r.varietyId === 'northblue')!;
    expect(nb.reasons.some((x) => x.includes('匹配'))).toBe(true);
    expect(nb.score).toBeGreaterThan(100);
  });

  it('BORDERLINE 时耐阴品种获得加成', () => {
    const match = rankVarieties(varieties, { chillHoursEstimate: 700, heatLevel: 3 }, { status: 'MATCH', weight: 1 });
    const border = rankVarieties(varieties, { chillHoursEstimate: 700, heatLevel: 3 }, { status: 'BORDERLINE', weight: 0.8 });
    // northblue shade_tolerance=3 gets +15 in borderline before weight
    const nbMatch = match.find((r) => r.varietyId === 'northblue')!;
    const nbBorder = border.find((r) => r.varietyId === 'northblue')!;
    expect(nbBorder.score / 0.8).toBeCloseTo(nbMatch.score + 15, 0);
  });
});

describe('recommend-engine / 授粉', () => {
  const allVarieties = [
    { id: 'oneal', name: '奥尼尔', bloomGroup: 'southern_early' },
    { id: 'misty', name: '薄雾', bloomGroup: 'southern_early' },
    { id: 'northblue', name: '北蓝', bloomGroup: 'halfhigh_mid' },
  ];

  it('partially_self_fertile → need_two=false + 同花期搭档建议', () => {
    const r = resolvePollination(
      { varietyId: 'oneal', sexType: 'hermaphrodite', selfFertility: 'partially_self_fertile', crossRequired: false, bloomGroup: 'southern_early', notes: null },
      [],
      allVarieties,
    );
    expect(r.need_two).toBe(false);
    expect(r.recommended_partners.map((p: any) => p.name)).toContain('薄雾');
    expect(r.note).toContain('可选');
  });

  it('V11: cross_required=true → need_two=true + Compatibility good 搭档', () => {
    const r = resolvePollination(
      { varietyId: 'oneal', sexType: 'hermaphrodite', selfFertility: 'self_sterile', crossRequired: true, bloomGroup: 'southern_early', notes: null },
      [{ varietyId: 'oneal', partnerVarietyId: 'misty', compatibility: 'good' }],
      allVarieties,
    );
    expect(r.need_two).toBe(true);
    expect(r.recommended_partners.map((p: any) => p.name)).toEqual(['薄雾']);
    expect(r.note).toContain('两株');
  });
});

describe('recommend-engine / 容器推荐', () => {
  const types = [
    { id: 'plastic', name: '塑料盆', drainage: 2, aeration: 2, waterRetention: 4 },
    { id: 'clay', name: '陶土盆', drainage: 4, aeration: 4, waterRetention: 2 },
    { id: 'fabric', name: '无纺布美植袋', drainage: 5, aeration: 5, waterRetention: 1 },
  ];
  const reqs: ContainerRequirementRow[] = [
    {
      id: 'crop-level', cropId: 'blueberry', varietyId: null,
      minVolumeL: 20, preferredVolumeMinL: 25, preferredVolumeMaxL: 40,
      minDepthCm: 35, minWidthCm: null, minDrainageLevel: 3, minAerationLevel: 3,
      preferredContainerTypeIds: ['fabric', 'clay'], avoidContainerTypeIds: [],
      supportRequired: false, repotYears: 2, reason: 'crop rule',
    },
    {
      id: 'variety-level', cropId: 'blueberry', varietyId: 'northblue',
      minVolumeL: 15, preferredVolumeMinL: 20, preferredVolumeMaxL: 30,
      minDepthCm: 30, minWidthCm: null, minDrainageLevel: 3, minAerationLevel: 3,
      preferredContainerTypeIds: ['fabric', 'clay', 'plastic'], avoidContainerTypeIds: [],
      supportRequired: false, repotYears: 2, reason: 'variety rule',
    },
  ];

  it('variety 级规则优先于 crop 级', () => {
    const r = selectRequirement(reqs, 'northblue')!;
    expect(r.id).toBe('variety-level');
    expect(r.preferredVolumeMinL).toBe(20);
  });

  it('无 variety 规则时回落 crop 级；排水不达标的容器被排除', () => {
    const rec = recommendContainer(reqs, types, 'oneal')!;
    expect(rec.volumeRange).toEqual([25, 40]);
    expect(rec.preferredTypes.map((t) => t.id).sort()).toEqual(['clay', 'fabric']);
    // plastic drainage=2 < min 3 -> not recommended
    expect(rec.avoidTypes.map((t) => t.id)).toContain('plastic');
    expect(rec.repotNote).toContain('2 年');
  });
});

describe('recommend-engine / 积水风险', () => {
  const config: WaterRiskConfigRow[] = [
    { sensitivityBand: 'high', containerDrainageBand: 'high', mixDrainageBand: 'mid', rainExposed: false, riskLevel: 'low', mitigation: [] },
    { sensitivityBand: 'high', containerDrainageBand: 'low', mixDrainageBand: 'low', rainExposed: true, riskLevel: 'high', mitigation: ['提高排水材料比例'] },
  ];

  it('查表返回正确档位', () => {
    const low = assessWaterRisk(4, 5, 3.0, false, config);
    expect(low.level).toBe('low');
    const high = assessWaterRisk(4, 1, 2.0, true, config);
    expect(high.level).toBe('high');
    expect(high.mitigation).toContain('提高排水材料比例');
  });
});
