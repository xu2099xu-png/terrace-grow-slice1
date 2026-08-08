/**
 * recommend-engine / container recommendation — pure functions.
 * v1.4 §3.3 + §4.1: rules from ContainerRequirement rows, variety-level overrides
 * crop-level; multiple hits merge conservatively.
 */

export interface ContainerRequirementRow {
  id: string;
  cropId: string;
  varietyId: string | null;
  minVolumeL: number;
  preferredVolumeMinL: number;
  preferredVolumeMaxL: number;
  minDepthCm: number | null;
  minWidthCm: number | null;
  minDrainageLevel: number;
  minAerationLevel: number;
  preferredContainerTypeIds: string[];
  avoidContainerTypeIds: string[];
  supportRequired: boolean;
  repotYears: number | null;
  reason: string | null;
}

export interface ContainerTypeRow {
  id: string;
  name: string;
  drainage: number;
  aeration: number;
  waterRetention: number;
}

export interface ContainerRecommendation {
  volumeRange: [number, number]; // preferred range
  minVolumeL: number;
  minDepthCm: number | null;
  preferredTypes: ContainerTypeRow[];
  acceptableTypes: ContainerTypeRow[]; // meet min levels but not preferred
  avoidTypes: ContainerTypeRow[]; // explicitly avoided or below min drainage/aeration
  supportRequired: boolean;
  repotNote: string | null;
  reason: string | null;
}

/**
 * Query logic (v1.4 §4.1):
 *  1. rows matching varietyId -> variety-level
 *  2. else rows matching cropId with varietyId null -> crop-level
 *  Multiple hits: strictest mins, volume range intersection, avoid lists merged.
 */
export function selectRequirement(
  requirements: ContainerRequirementRow[],
  varietyId: string | null,
): ContainerRequirementRow | null {
  if (varietyId) {
    const vRows = requirements.filter((r) => r.varietyId === varietyId);
    if (vRows.length > 0) return mergeRequirements(vRows);
  }
  const cRows = requirements.filter((r) => r.varietyId === null);
  if (cRows.length > 0) return mergeRequirements(cRows);
  return null;
}

function mergeRequirements(rows: ContainerRequirementRow[]): ContainerRequirementRow {
  if (rows.length === 1) return rows[0];
  const merged: ContainerRequirementRow = { ...rows[0] };
  for (const r of rows.slice(1)) {
    merged.minVolumeL = Math.max(merged.minVolumeL, r.minVolumeL);
    merged.preferredVolumeMinL = Math.max(merged.preferredVolumeMinL, r.preferredVolumeMinL);
    merged.preferredVolumeMaxL = Math.min(merged.preferredVolumeMaxL, r.preferredVolumeMaxL);
    merged.minDrainageLevel = Math.max(merged.minDrainageLevel, r.minDrainageLevel);
    merged.minAerationLevel = Math.max(merged.minAerationLevel, r.minAerationLevel);
    merged.minDepthCm = maxNullable(merged.minDepthCm, r.minDepthCm);
    merged.minWidthCm = maxNullable(merged.minWidthCm, r.minWidthCm);
    merged.supportRequired = merged.supportRequired || r.supportRequired;
    merged.preferredContainerTypeIds = [
      ...new Set([...merged.preferredContainerTypeIds, ...r.preferredContainerTypeIds]),
    ];
    merged.avoidContainerTypeIds = [
      ...new Set([...merged.avoidContainerTypeIds, ...r.avoidContainerTypeIds]),
    ];
  }
  if (merged.preferredVolumeMaxL < merged.preferredVolumeMinL) {
    merged.preferredVolumeMaxL = merged.preferredVolumeMinL;
  }
  return merged;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

export function recommendContainer(
  requirements: ContainerRequirementRow[],
  containerTypes: ContainerTypeRow[],
  varietyId: string | null,
): ContainerRecommendation | null {
  const req = selectRequirement(requirements, varietyId);
  if (!req) return null;

  const avoidIds = new Set(req.avoidContainerTypeIds);
  const preferred: ContainerTypeRow[] = [];
  const acceptable: ContainerTypeRow[] = [];
  const avoid: ContainerTypeRow[] = [];

  for (const t of containerTypes) {
    const belowMin = t.drainage < req.minDrainageLevel || t.aeration < req.minAerationLevel;
    if (avoidIds.has(t.id) || belowMin) {
      avoid.push(t);
    } else if (req.preferredContainerTypeIds.includes(t.id)) {
      preferred.push(t);
    } else {
      acceptable.push(t);
    }
  }

  return {
    volumeRange: [req.preferredVolumeMinL, req.preferredVolumeMaxL],
    minVolumeL: req.minVolumeL,
    minDepthCm: req.minDepthCm,
    preferredTypes: preferred,
    acceptableTypes: acceptable,
    avoidTypes: avoid,
    supportRequired: req.supportRequired,
    repotNote: req.repotYears ? `建议每 ${req.repotYears} 年左右换盆一次` : null,
    reason: req.reason,
  };
}
