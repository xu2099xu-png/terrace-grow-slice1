import { calculateSoilMix } from './src/engines/soil-engine/index';
import { EngineMaterial, SoilEngineInput } from './src/engines/soil-engine/types';

const peat: EngineMaterial = { id: 'peat', name: '泥炭', functionGroup: 'base', drainage: 2, aeration: 2, waterRetention: 4, acidifying: true, costLevel: 2 };
const coco: EngineMaterial = { id: 'coco', name: '椰糠', functionGroup: 'base', drainage: 2, aeration: 3, waterRetention: 4, acidifying: false, costLevel: 1 };
const perlite: EngineMaterial = { id: 'perlite', name: '珍珠岩', functionGroup: 'drainage', drainage: 5, aeration: 4, waterRetention: 1, acidifying: false, costLevel: 1 };
const bark: EngineMaterial = { id: 'bark', name: '松鳞', functionGroup: 'organic', drainage: 4, aeration: 4, waterRetention: 2, acidifying: true, costLevel: 2 };
const vermiculite: EngineMaterial = { id: 'vermiculite', name: '蛭石', functionGroup: 'retention', drainage: 1, aeration: 2, waterRetention: 5, acidifying: false, costLevel: 2 };
const sand: EngineMaterial = { id: 'sand', name: '粗沙', functionGroup: 'drainage', drainage: 4, aeration: 3, waterRetention: 0, acidifying: false, costLevel: 1 };
const garden: EngineMaterial = { id: 'garden', name: '园土', functionGroup: 'base', drainage: 1, aeration: 1, waterRetention: 3, acidifying: false, costLevel: 1 };

const ALL = [peat, coco, perlite, bark, vermiculite, sand, garden];

const baseInput: SoilEngineInput = {
  slots: [
    { functionGroup: 'base', minPct: 40, maxPct: 60, preferredMaterials: ['peat', 'coco'], required: true },
    { functionGroup: 'drainage', minPct: 20, maxPct: 35, preferredMaterials: ['perlite'], required: true },
    { functionGroup: 'organic', minPct: 10, maxPct: 25, preferredMaterials: ['bark'], required: true },
    { functionGroup: 'retention', minPct: 0, maxPct: 15, preferredMaterials: ['vermiculite'], required: false },
  ],
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
console.log('feasibility:', r.feasibility);
console.log('need_acidification:', r.need_acidification);
console.log('mix:', r.mix.map(m => ({ id: m.materialId, pct: m.pct })));
console.log('ph_management_note:', r.ph_management_note);
console.log('reasons:', r.reasons);
