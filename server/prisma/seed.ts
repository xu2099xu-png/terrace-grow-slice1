/**
 * Slice 1 seed — 蓝莓 DEV_FIXTURE
 *
 * !!! WARNING !!!
 * All agricultural data in this file is DEV_FIXTURE (reviewStatus='draft',
 * confidence 1-2, EvidenceSource.sourceType='ai_synthesis').
 * It exists ONLY to verify the program. It is NOT approved agricultural
 * content and must not be treated as production farming facts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Seed protection: refuse destructive re-seed on non-test databases. */
function guardProductionDatabase() {
  const url = process.env.DATABASE_URL || '';
  const isTestEnv = ['development', 'test'].includes(process.env.NODE_ENV || '');
  const isTestDb = /localhost|127\.0\.0\.1|:5433|test/i.test(url);
  if (!isTestEnv && !isTestDb) {
    console.error('');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('  REFUSING TO SEED: DATABASE_URL does not look like a');
    console.error('  development/test database. All seed data is DEV_FIXTURE');
    console.error('  (reviewStatus=draft) and will WIPE existing data.');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('');
    process.exit(1);
  }
}

const GOV = { source: 'manual', reviewStatus: 'draft', confidence: 1 } as const;
// for tables without a version column

async function clear() {
  await prisma.factEvidence.deleteMany();
  await prisma.evidenceSource.deleteMany();
  await prisma.userMaterialInventory.deleteMany();
  await prisma.waterRiskConfig.deleteMany();
  await prisma.soilRecipeSlot.deleteMany();
  await prisma.soilRecipeTemplate.deleteMany();
  await prisma.materialSubstitution.deleteMany();
  await prisma.materialCropRule.deleteMany();
  await prisma.substrateMaterial.deleteMany();
  await prisma.containerRequirement.deleteMany();
  await prisma.containerModifier.deleteMany();
  await prisma.containerType.deleteMany();
  await prisma.environmentRequirement.deleteMany();
  await prisma.pollinationCompatibility.deleteMany();
  await prisma.pollinationProfile.deleteMany();
  await prisma.varietyTrait.deleteMany();
  await prisma.attributeDefinition.deleteMany();
  await prisma.variety.deleteMany();
  await prisma.crop.deleteMany();
  await prisma.climateZone.deleteMany();
  await prisma.sunEstimateRule.deleteMany();
  await prisma.sunLevelMap.deleteMany();
}

async function main() {
  guardProductionDatabase();
  console.log('====================================================');
  console.log(' SEEDING DEV_FIXTURE DATA — NOT APPROVED CONTENT');
  console.log(' reviewStatus=draft, for program verification only');
  console.log('====================================================');
  await clear();

  // ---------- sunlight config (data, not code) ----------
  await prisma.sunLevelMap.createMany({
    data: [
      { level: 'LOW', label: '基本晒不到', hoursMin: 0, hoursMax: 2 },
      { level: 'SHORT', label: '晒一小会儿', hoursMin: 2, hoursMax: 4 },
      { level: 'MEDIUM', label: '半天左右', hoursMin: 4, hoursMax: 6 },
      { level: 'LONG', label: '大部分白天', hoursMin: 6, hoursMax: 9 },
      { level: 'UNKNOWN', label: '不确定', hoursMin: 2, hoursMax: 6 },
    ],
  });

  // (orientation, timeObs) -> estimate. Wider ranges than direct answers (宁宽勿窄).
  const rules: Array<[string, string, string, number, number, string]> = [
    // orientation, timeObs, level, min, max, confidence
    ['south', 'morning', 'MEDIUM', 3, 6, 'medium'],
    ['south', 'afternoon', 'MEDIUM', 4, 7, 'medium'],
    ['south', 'allday', 'LONG', 6, 9, 'medium'],
    ['south', 'rarely', 'SHORT', 1, 3, 'low'],
    ['south', 'unknown', 'MEDIUM', 3, 7, 'low'],
    ['east', 'morning', 'SHORT', 2, 5, 'medium'],
    ['east', 'afternoon', 'SHORT', 1, 4, 'low'],
    ['east', 'allday', 'MEDIUM', 3, 6, 'low'],
    ['east', 'rarely', 'LOW', 0, 2, 'low'],
    ['east', 'unknown', 'SHORT', 1, 5, 'low'],
    ['west', 'morning', 'SHORT', 1, 3, 'low'],
    ['west', 'afternoon', 'MEDIUM', 3, 6, 'medium'],
    ['west', 'allday', 'MEDIUM', 3, 6, 'low'],
    ['west', 'rarely', 'LOW', 0, 2, 'low'],
    ['west', 'unknown', 'SHORT', 1, 5, 'low'],
    ['north', 'morning', 'LOW', 0, 2, 'medium'],
    ['north', 'afternoon', 'LOW', 0, 3, 'low'],
    ['north', 'allday', 'LOW', 1, 3, 'low'],
    ['north', 'rarely', 'LOW', 0, 1, 'medium'],
    ['north', 'unknown', 'LOW', 0, 3, 'low'],
    ['unknown', 'morning', 'SHORT', 1, 5, 'low'],
    ['unknown', 'afternoon', 'MEDIUM', 1, 6, 'low'],
    ['unknown', 'allday', 'MEDIUM', 2, 8, 'low'],
    ['unknown', 'rarely', 'LOW', 0, 3, 'low'],
    ['unknown', 'unknown', 'UNKNOWN', 2, 6, 'low'], // V4 acceptance case
  ];
  await prisma.sunEstimateRule.createMany({
    data: rules.map(([orientation, timeObs, level, hoursMin, hoursMax, confidence]) => ({
      orientation, timeObs, level, hoursMin, hoursMax, confidence,
    })),
  });

  // ---------- climate zones (minimal set) ----------
  await prisma.climateZone.createMany({
    data: [
      {
        code: 'east_china', name: '华东',
        cityCodes: ['shanghai', 'hangzhou', 'nanjing', 'suzhou', 'ningbo', 'hefei', 'wuxi'],
        chillHoursEstimate: 700, heatLevel: 4,
      },
      {
        code: 'south_china', name: '华南',
        cityCodes: ['guangzhou', 'shenzhen', 'fuzhou', 'xiamen', 'nanning'],
        chillHoursEstimate: 300, heatLevel: 5,
      },
      {
        code: 'north_china', name: '华北',
        cityCodes: ['beijing', 'tianjin', 'shijiazhuang', 'jinan', 'zhengzhou'],
        chillHoursEstimate: 1200, heatLevel: 3,
      },
    ],
  });

  // ---------- crop: blueberry ----------
  const crop = await prisma.crop.create({
    data: {
      id: 'crop-blueberry',
      name: '蓝莓',
      latinName: 'Vaccinium spp.',
      lifeType: 'perennial',
      category: 'fruit',
      difficulty: 3,
      familyUse: 5,
      yieldLevel: 3,
      harvestDaysMin: 365,
      harvestDaysMax: 730,
      containerFriendly: true,
      recommendedStartMethod: 'nursery_plant',
      startMethodNote: '蓝莓建议直接买 2-3 年生苗，播种周期太长',
      waterloggingSensitivity: 4,
      acidityNeed: 'acid_required',
      requiresAcidification: true,
      ...GOV, version: 1,
    },
  });

  // ---------- attributes ----------
  const [attrChill, attrHeat, attrShade] = await Promise.all([
    prisma.attributeDefinition.create({
      data: {
        id: 'attr-chill-hours-min', key: 'chill_hours_min', label: '需冷量(小时)',
        valueType: 'number', unit: 'hours', usedIn: ['recommendation'],
        appliesToCropIds: [crop.id], ...GOV, version: 1,
      },
    }),
    prisma.attributeDefinition.create({
      data: {
        id: 'attr-heat-tolerance', key: 'heat_tolerance', label: '耐热性',
        valueType: 'number', unit: '1-5', usedIn: ['recommendation'],
        appliesToCropIds: [crop.id], ...GOV, version: 1,
      },
    }),
    prisma.attributeDefinition.create({
      data: {
        id: 'attr-shade-tolerance', key: 'shade_tolerance', label: '耐阴性',
        valueType: 'number', unit: '1-5', usedIn: ['recommendation'],
        appliesToCropIds: [crop.id], ...GOV,
      },
    }),
  ]);

  // ---------- varieties (3 test varieties) ----------
  const oneal = await prisma.variety.create({
    data: {
      id: 'var-oneal', cropId: crop.id, name: '奥尼尔',
      maturePeriod: 'early', plantHabit: 'standard', containerFit: 4, ...GOV, version: 1,
    },
  });
  const misty = await prisma.variety.create({
    data: {
      id: 'var-misty', cropId: crop.id, name: '薄雾',
      maturePeriod: 'mid', plantHabit: 'standard', containerFit: 4, ...GOV, version: 1,
    },
  });
  const northblue = await prisma.variety.create({
    data: {
      id: 'var-northblue', cropId: crop.id, name: '北蓝',
      maturePeriod: 'late', plantHabit: 'compact', containerFit: 5, ...GOV, version: 1,
    },
  });

  await prisma.varietyTrait.createMany({
    data: [
      // O'Neal: southern highbush, low chill, heat tolerant
      { varietyId: oneal.id, attributeId: attrChill.id, valueNumber: 300, ...GOV },
      { varietyId: oneal.id, attributeId: attrHeat.id, valueNumber: 4, ...GOV },
      { varietyId: oneal.id, attributeId: attrShade.id, valueNumber: 2, ...GOV },
      // Misty: southern highbush, lowest chill
      { varietyId: misty.id, attributeId: attrChill.id, valueNumber: 250, ...GOV },
      { varietyId: misty.id, attributeId: attrHeat.id, valueNumber: 4, ...GOV },
      { varietyId: misty.id, attributeId: attrShade.id, valueNumber: 2, ...GOV },
      // Northblue: half-high, high chill, cold hardy, compact
      { varietyId: northblue.id, attributeId: attrChill.id, valueNumber: 900, ...GOV },
      { varietyId: northblue.id, attributeId: attrHeat.id, valueNumber: 2, ...GOV },
      { varietyId: northblue.id, attributeId: attrShade.id, valueNumber: 3, ...GOV },
    ],
  });

  // ---------- pollination ----------
  await prisma.pollinationProfile.createMany({
    data: [
      {
        varietyId: oneal.id, sexType: 'hermaphrodite',
        selfFertility: 'partially_self_fertile', crossRequired: false,
        bloomGroup: 'southern_early', notes: '自花可结果，异株授粉产量更高',
        ...GOV,
      },
      {
        varietyId: misty.id, sexType: 'hermaphrodite',
        selfFertility: 'partially_self_fertile', crossRequired: false,
        bloomGroup: 'southern_early', notes: '与奥尼尔花期重叠',
        ...GOV,
      },
      {
        varietyId: northblue.id, sexType: 'hermaphrodite',
        selfFertility: 'partially_self_fertile', crossRequired: false,
        bloomGroup: 'halfhigh_mid', ...GOV,
      },
    ],
  });
  await prisma.pollinationCompatibility.createMany({
    data: [
      { varietyId: oneal.id, partnerVarietyId: misty.id, compatibility: 'good', reason: '同为南高丛，花期重叠', ...GOV },
      { varietyId: misty.id, partnerVarietyId: oneal.id, compatibility: 'good', reason: '同为南高丛，花期重叠', ...GOV },
    ],
  });

  // ---------- environment requirement ----------
  await prisma.environmentRequirement.create({
    data: {
      id: 'envreq-blueberry', ownerType: 'crop', ownerId: crop.id,
      minSunHours: 6, tempMin: -15, tempMax: 38,
      optimalTempMin: 15, optimalTempMax: 28, frostSensitive: false,
      ...GOV,
    },
  });

  // ---------- containers ----------
  const plasticPot = await prisma.containerType.create({
    data: { id: 'ct-plastic-pot', name: '塑料盆', drainage: 2, aeration: 2, waterRetention: 4, ...GOV },
  });
  const clayPot = await prisma.containerType.create({
    data: { id: 'ct-clay-pot', name: '陶土盆', drainage: 4, aeration: 4, waterRetention: 2, ...GOV },
  });
  const fabricBag = await prisma.containerType.create({
    data: { id: 'ct-fabric-bag', name: '无纺布美植袋', drainage: 5, aeration: 5, waterRetention: 1, ...GOV },
  });

  await prisma.containerModifier.createMany({
    data: [
      // plastic pot drains poorly -> soil needs more drainage, less retention
      {
        containerTypeId: plasticPot.id, adjustTarget: 'drainage', delta: 1,
        directionHint: { increase_group: 'drainage', decrease_group: 'retention' }, ...GOV,
      },
      {
        containerTypeId: plasticPot.id, adjustTarget: 'water_retention', delta: -1,
        directionHint: { increase_group: 'drainage', decrease_group: 'retention' }, ...GOV,
      },
      // fabric bag dries out fast -> soil needs more retention
      {
        containerTypeId: fabricBag.id, adjustTarget: 'water_retention', delta: 2,
        directionHint: { increase_group: 'retention', decrease_group: 'drainage' }, ...GOV,
      },
      // clay pot breathes -> slight retention bump
      {
        containerTypeId: clayPot.id, adjustTarget: 'water_retention', delta: 1,
        directionHint: { increase_group: 'retention' }, ...GOV,
      },
    ],
  });

  // ---------- container requirements (v1.4 §3.3) ----------
  const cropReq = await prisma.containerRequirement.create({
    data: {
      id: 'ctreq-blueberry-crop', cropId: crop.id, varietyId: null,
      minVolumeL: 20, preferredVolumeMinL: 25, preferredVolumeMaxL: 40,
      minDepthCm: 35, minWidthCm: null,
      minDrainageLevel: 3, minAerationLevel: 3,
      preferredContainerTypeIds: [fabricBag.id, clayPot.id],
      avoidContainerTypeIds: [],
      supportRequired: false, repotYears: 2,
      reason: '蓝莓怕积水、喜透气，建议 25L 以上排水好的盆器，每 2 年左右换盆',
      ...GOV,
    },
  });
  await prisma.containerRequirement.create({
    data: {
      id: 'ctreq-northblue', cropId: crop.id, varietyId: northblue.id,
      minVolumeL: 15, preferredVolumeMinL: 20, preferredVolumeMaxL: 30,
      minDepthCm: 30, minWidthCm: null,
      minDrainageLevel: 3, minAerationLevel: 3,
      preferredContainerTypeIds: [fabricBag.id, clayPot.id, plasticPot.id],
      avoidContainerTypeIds: [],
      supportRequired: false, repotYears: 2,
      reason: '北蓝株型紧凑，20L 左右盆器即可',
      ...GOV,
    },
  });

  // ---------- substrate materials (8) ----------
  const peat = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-peat', name: '泥炭', functionGroup: 'base',
      waterRetention: 4, drainage: 2, aeration: 2, organicMatter: 4, nutrient: 1,
      acidifying: true, costLevel: 2, commonality: 3, ...GOV,
    },
  });
  const coco = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-coco', name: '椰糠', functionGroup: 'base',
      waterRetention: 4, drainage: 2, aeration: 3, organicMatter: 3, nutrient: 1,
      acidifying: false, costLevel: 1, commonality: 3, ...GOV,
    },
  });
  const perlite = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-perlite', name: '珍珠岩', functionGroup: 'drainage',
      waterRetention: 1, drainage: 5, aeration: 4, organicMatter: 0, nutrient: 0,
      acidifying: false, costLevel: 1, commonality: 3, ...GOV,
    },
  });
  const pineBark = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-pine-bark', name: '松鳞', functionGroup: 'organic',
      waterRetention: 2, drainage: 4, aeration: 4, organicMatter: 4, nutrient: 1,
      acidifying: true, costLevel: 2, commonality: 2, ...GOV,
    },
  });
  const vermiculite = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-vermiculite', name: '蛭石', functionGroup: 'retention',
      waterRetention: 5, drainage: 1, aeration: 2, organicMatter: 0, nutrient: 1,
      acidifying: false, costLevel: 2, commonality: 2, ...GOV,
    },
  });
  const pineSoil = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-pine-soil', name: '松针土', functionGroup: 'organic',
      waterRetention: 3, drainage: 3, aeration: 3, organicMatter: 5, nutrient: 2,
      acidifying: true, costLevel: 1, commonality: 1, ...GOV,
    },
  });
  const sand = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-sand', name: '粗沙', functionGroup: 'drainage',
      waterRetention: 0, drainage: 4, aeration: 3, organicMatter: 0, nutrient: 0,
      acidifying: false, costLevel: 1, commonality: 3, ...GOV,
    },
  });
  const gardenSoil = await prisma.substrateMaterial.create({
    data: {
      id: 'mat-garden-soil', name: '园土', functionGroup: 'base',
      waterRetention: 3, drainage: 1, aeration: 1, organicMatter: 2, nutrient: 2,
      acidifying: false, costLevel: 1, commonality: 3, ...GOV,
    },
  });

  // ---------- material crop rules (blueberry) ----------
  await prisma.materialCropRule.createMany({
    data: [
      { cropId: crop.id, materialId: peat.id, level: 'recommended', reason: '蓝莓喜酸，泥炭是常用基础基质', ...GOV },
      { cropId: crop.id, materialId: coco.id, level: 'allowed', reason: '椰糠保水好但偏中性，需配合调酸', ...GOV },
      { cropId: crop.id, materialId: perlite.id, level: 'recommended', reason: '珍珠岩提供排水和透气', ...GOV },
      { cropId: crop.id, materialId: pineBark.id, level: 'recommended', reason: '松鳞调酸又透气，很适合蓝莓', ...GOV },
      { cropId: crop.id, materialId: vermiculite.id, level: 'allowed', reason: '蛭石保水，适量即可', ...GOV },
      { cropId: crop.id, materialId: pineSoil.id, level: 'recommended', reason: '松针土天然偏酸', ...GOV },
      { cropId: crop.id, materialId: sand.id, level: 'caution', reason: '粗沙沉重易板结，比例不宜高', ...GOV },
      { cropId: crop.id, materialId: gardenSoil.id, level: 'avoid', reason: '园土偏碱且易积水板结，不适合蓝莓', ...GOV },
    ],
  });

  // ---------- substitutions (v1.4: no ratio_factor) ----------
  await prisma.materialSubstitution.createMany({
    data: [
      {
        materialFromId: peat.id, materialToId: coco.id, scope: 'base',
        compatibility: 4, penalty: 1,
        conditions: '椰糠可替代泥炭作基础基质，但需加强调酸管理', confidence: 3,
        source: 'manual', reviewStatus: 'draft',
      },
      {
        materialFromId: peat.id, materialToId: pineSoil.id, scope: 'base',
        compatibility: 3, penalty: 1,
        conditions: '松针土可部分替代泥炭，注意腐熟程度', confidence: 2,
        source: 'manual', reviewStatus: 'draft',
      },
      {
        materialFromId: perlite.id, materialToId: vermiculite.id, scope: 'drainage',
        compatibility: 2, penalty: 2,
        conditions: '蛭石排水弱于珍珠岩，仅在排水压力不大时替代', confidence: 2,
        source: 'manual', reviewStatus: 'draft',
      },
      {
        materialFromId: pineBark.id, materialToId: pineSoil.id, scope: 'organic',
        compatibility: 4, penalty: 1,
        conditions: '松针土可替代松鳞提供有机质和酸性', confidence: 3,
        source: 'manual', reviewStatus: 'draft',
      },
    ],
  });

  // ---------- soil recipe templates (blueberry) ----------
  // Main template: strict targets for optimal solve
  const template = await prisma.soilRecipeTemplate.create({
    data: {
      id: 'soil-tpl-blueberry', cropId: crop.id, varietyId: null,
      baseVolumeL: 30, isFallback: false,
      // disclosed addition: H3-H5 target intervals as data
      targetProperties: { drainage: [3.0, 4.2], aeration: [2.8, 4.0], retention: [2.2, 3.2] },
      ...GOV,
    },
  });
  await prisma.soilRecipeSlot.createMany({
    data: [
      {
        templateId: template.id, functionGroup: 'base',
        minPct: 40, maxPct: 60, required: true,
        preferredMaterials: [peat.id, coco.id],
      },
      {
        templateId: template.id, functionGroup: 'drainage',
        minPct: 20, maxPct: 35, required: true,
        preferredMaterials: [perlite.id],
      },
      {
        templateId: template.id, functionGroup: 'organic',
        minPct: 10, maxPct: 25, required: true,
        preferredMaterials: [pineBark.id, pineSoil.id],
      },
      {
        templateId: template.id, functionGroup: 'retention',
        minPct: 0, maxPct: 15, required: false,
        preferredMaterials: [vermiculite.id],
      },
    ],
  });

  // Fallback template: reviewed reference recipe with wider but still valid targets
  const fallbackTpl = await prisma.soilRecipeTemplate.create({
    data: {
      id: 'soil-tpl-blueberry-fallback', cropId: crop.id, varietyId: null,
      baseVolumeL: 30, isFallback: true,
      targetProperties: { drainage: [2.5, 4.5], aeration: [2.5, 4.5], retention: [2.0, 3.5] },
      ...GOV,
    },
  });
  await prisma.soilRecipeSlot.createMany({
    data: [
      {
        templateId: fallbackTpl.id, functionGroup: 'base',
        minPct: 35, maxPct: 65, required: true,
        preferredMaterials: [peat.id, coco.id],
      },
      {
        templateId: fallbackTpl.id, functionGroup: 'drainage',
        minPct: 15, maxPct: 40, required: true,
        preferredMaterials: [perlite.id],
      },
      {
        templateId: fallbackTpl.id, functionGroup: 'organic',
        minPct: 5, maxPct: 30, required: true,
        preferredMaterials: [pineBark.id, pineSoil.id],
      },
      {
        templateId: fallbackTpl.id, functionGroup: 'retention',
        minPct: 0, maxPct: 20, required: false,
        preferredMaterials: [vermiculite.id],
      },
    ],
  });

  // ---------- water risk config (banded lookup, generated as data) ----------
  const sensBand = { low: 1.5, mid: 3, high: 4.5 } as const;
  const drainBand = { low: 1.5, mid: 3, high: 4.5 } as const;
  const riskRows: any[] = [];
  for (const s of ['low', 'mid', 'high'] as const) {
    for (const c of ['low', 'mid', 'high'] as const) {
      for (const m of ['low', 'mid', 'high'] as const) {
        for (const rain of [false, true]) {
          const score = sensBand[s] - 0.7 * drainBand[c] - 0.7 * drainBand[m] + (rain ? 1 : 0);
          const riskLevel = score >= 2.2 ? 'high' : score >= 0.5 ? 'mid' : 'low';
          const mitigation =
            riskLevel === 'high'
              ? ['提高排水材料比例', '改用排水更好的容器（如无纺布美植袋）', '雨季垫高盆底或移到淋不到雨的位置']
              : riskLevel === 'mid'
                ? ['雨后及时倒掉托盘积水', '可适当提高排水材料比例']
                : [];
          riskRows.push({
            sensitivityBand: s, containerDrainageBand: c, mixDrainageBand: m,
            rainExposed: rain, riskLevel, mitigation,
          });
        }
      }
    }
  }
  await prisma.waterRiskConfig.createMany({ data: riskRows });

  // ---------- evidence (v1.4 §3.21-3.22) ----------
  const ev1 = await prisma.evidenceSource.create({
    data: {
      id: 'ev-src-1', title: '蓝莓基质栽培技术要点（开发者整理）',
      organization: null, url: null, citation: null,
      sourceType: 'ai_synthesis',
      notes: 'DEV_FIXTURE：未经人工审核，仅用于程序验证，不是农业事实',
    },
  });
  const ev2 = await prisma.evidenceSource.create({
    data: {
      id: 'ev-src-2', title: '南方高丛蓝莓品种特性汇总（开发者整理）',
      sourceType: 'ai_synthesis',
      notes: 'DEV_FIXTURE：未经人工审核，仅用于程序验证，不是农业事实',
    },
  });
  const chillTraits = await prisma.varietyTrait.findMany({ where: { attributeId: attrChill.id } });
  await prisma.factEvidence.createMany({
    data: [
      ...chillTraits.map((t) => ({
        entityType: 'VarietyTrait', entityId: t.id, fieldName: 'chill_hours_min',
        evidenceSourceId: ev2.id, note: 'DEV_FIXTURE 占位证据，待人工审核', reviewStatus: 'draft',
      })),
      {
        entityType: 'ContainerRequirement', entityId: cropReq.id, fieldName: 'min_volume_l',
        evidenceSourceId: ev1.id, note: 'DEV_FIXTURE 占位证据，待人工审核', reviewStatus: 'draft',
      },
    ],
  });

  console.log('Seed done.');
  console.log('  crop: 蓝莓 / varieties: 奥尼尔, 薄雾, 北蓝');
  console.log('  containers: 塑料盆, 陶土盆, 无纺布美植袋');
  console.log('  materials: 泥炭, 椰糠, 珍珠岩, 松鳞, 蛭石, 松针土, 粗沙(caution), 园土(avoid)');
  console.log('  ALL ROWS ARE reviewStatus=draft DEV_FIXTURE — NOT APPROVED CONTENT');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
