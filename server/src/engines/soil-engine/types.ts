/**
 * soil-engine — pure functions. No NestJS / Prisma dependencies.
 * Implements v1.4 §5: candidate generation, H1-H7 hard constraints,
 * 5-layer prioritized optimization, L1-L4 fallback ladder.
 */

export type FunctionGroup = 'base' | 'drainage' | 'retention' | 'organic';
export type RuleLevel = 'recommended' | 'allowed' | 'caution' | 'avoid';
export type Feasibility = 'optimal' | 'substituted' | 'relaxed' | 'fallback' | 'unavailable';

export interface EngineMaterial {
  id: string;
  name: string;
  functionGroup: FunctionGroup;
  drainage: number; // 0-5
  aeration: number; // 0-5
  waterRetention: number; // 0-5
  acidifying: boolean;
  costLevel: number; // 1-3
}

export interface EngineSlot {
  functionGroup: FunctionGroup;
  minPct: number;
  maxPct: number;
  preferredMaterials: string[]; // material ids
  required: boolean;
}

export interface EngineModifier {
  adjustTarget: 'water_retention' | 'drainage' | 'aeration';
  delta: number;
  directionHint?: { increase_group?: FunctionGroup; decrease_group?: FunctionGroup } | null;
}

export interface EngineSubstitution {
  fromId: string;
  toId: string;
  scope: FunctionGroup;
  compatibility: number; // 1-5
  penalty: number; // 0-3
  conditions?: string | null;
}

export interface PropertyTargets {
  drainage: [number, number];
  aeration: [number, number];
  retention: [number, number];
}

export interface EngineConfig {
  stepPct: number; // composition granularity (default 5)
  maxNonZeroMaterials: number; // recipe simplicity cap (default 4)
  topK: number; // Layer 2 -> Layer 3 pool size (default 20)
  convenienceTolerance: number; // Layer 4 "相近" band (default 0.05)
  cautionPenalty: number; // Layer 2 caution weight (default 1.0)
  substitutionPenalty: number; // Layer 2 substitution weight (default 0.5)
  // soft preference only (NOT a pH model): for acid-loving crops, quality layer
  // mildly prefers mixes whose acidifying share reaches a reasonable share
  acidLackPenalty: number; // default 2
}

export const DEFAULT_CONFIG: EngineConfig = {
  stepPct: 5,
  maxNonZeroMaterials: 4,
  topK: 20,
  convenienceTolerance: 0.05,
  cautionPenalty: 1.0,
  substitutionPenalty: 0.5,
  acidLackPenalty: 2,
};

export interface SoilEngineInput {
  slots: EngineSlot[];
  materials: EngineMaterial[]; // full material dictionary
  ownedMaterialIds: string[];
  cropRules: Record<string, RuleLevel>; // materialId -> level (crop rules merged with generic)
  ruleReasons?: Record<string, string>;
  substitutions: EngineSubstitution[];
  modifiers: EngineModifier[]; // from selected ContainerType
  targets: PropertyTargets; // H3-H5 target intervals (from template data)
  volumeL: number;
  requiresAcidification: boolean;
  phManagementNote?: string | null; // crop-aware note, never a calculated pH value
  forbiddenPairs?: [string, string][];
  config?: Partial<EngineConfig>;
  /** L3 fallback: reviewed template with its own slot bounds and targets. */
  fallbackTemplate?: {
    slots: EngineSlot[];
    targets: PropertyTargets;
  };
}

export interface MixLine {
  materialId: string;
  material: string;
  pct: number;
  liters: number;
  source: 'user_owned' | 'to_purchase';
}

export interface MissingLine {
  materialId: string;
  material: string;
  liters: number;
  reason: string;
}

export interface SubstitutionApplied {
  from: string;
  to: string;
  scope: FunctionGroup;
  note?: string;
}

export interface SoilResult {
  mix: MixLine[];
  missing: MissingLine[];
  substitutions_applied: SubstitutionApplied[];
  need_acidification: boolean;
  ph_management_note: string | null;
  feasibility: Feasibility;
  water_retention_score: number;
  drainage_score: number;
  aeration_score: number;
  reasons: string[];
}

/** internal: a composition = materialId -> pct */
export type Composition = Map<string, number>;
