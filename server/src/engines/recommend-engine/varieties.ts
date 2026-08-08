/**
 * recommend-engine / variety ranking + pollination — pure functions.
 * v1.3 §5.2 Step 3 + v1.4 §3.6 pollination usage logic.
 */

export interface VarietyTraits {
  chill_hours_min?: number;
  heat_tolerance?: number; // 1-5
  shade_tolerance?: number; // 1-5
}

export interface VarietyInput {
  id: string;
  name: string;
  maturePeriod: string | null;
  plantHabit: string | null;
  containerFit: number | null;
  traits: VarietyTraits;
}

export interface ClimateZoneInput {
  chillHoursEstimate: number;
  heatLevel: number; // 1-5
}

export interface RankedVariety {
  varietyId: string;
  name: string;
  score: number;
  reasons: string[];
}

/**
 * Rank varieties for a climate zone + sunlight status.
 * All penalties/bonuses produce human-readable reasons (P-4: explainable).
 */
export function rankVarieties(
  varieties: VarietyInput[],
  zone: ClimateZoneInput,
  sunlight: { status: string; weight: number },
): RankedVariety[] {
  if (sunlight.weight === 0) {
    return []; // hard filter: NO_MATCH yields zero varieties
  }
  const ranked = varieties.map((v) => {
    let score = 100;
    const reasons: string[] = [];

    // chill requirement vs zone winter chill estimate
    if (v.traits.chill_hours_min != null) {
      const need = v.traits.chill_hours_min;
      const have = zone.chillHoursEstimate;
      if (need > have * 1.15) {
        score -= 40;
        reasons.push(`${v.name}需冷量偏高，当地冬季可能不够冷，可能影响开花结果`);
      } else if (need <= have) {
        score += 10;
        reasons.push(`需冷量与当地冬季匹配`);
      } else {
        score -= 10;
        reasons.push(`需冷量接近当地冬季上限，年份偏暖时有风险`);
      }
    }

    // heat tolerance vs zone summer heat
    if (v.traits.heat_tolerance != null && zone.heatLevel >= 4) {
      if (v.traits.heat_tolerance < zone.heatLevel - 1) {
        score -= 25;
        reasons.push(`当地夏季偏热，${v.name}耐热性一般`);
      } else {
        score += 5;
        reasons.push(`耐热性适合当地夏季`);
      }
    }

    // shade tolerance matters when sunlight is uncertain/borderline
    if ((sunlight.status === 'BORDERLINE' || sunlight.status === 'LIKELY_NO_MATCH') &&
        v.traits.shade_tolerance != null) {
      const bonus = v.traits.shade_tolerance * 5;
      score += bonus;
      if (v.traits.shade_tolerance >= 3) {
        reasons.push(`相对耐阴，日照略少时更稳`);
      }
    }

    if (v.containerFit != null && v.containerFit >= 4) {
      reasons.push(`株型适合盆栽`);
    }

    score = Math.round(score * sunlight.weight * 10) / 10;
    return { varietyId: v.id, name: v.name, score, reasons };
  });

  ranked.sort((x, y) => y.score - x.score || x.varietyId.localeCompare(y.varietyId));
  return ranked;
}

export interface PollinationProfileInput {
  varietyId: string;
  sexType: string;
  selfFertility: string;
  crossRequired: boolean;
  bloomGroup: string | null;
  notes: string | null;
}

export interface PollinationCompatRow {
  varietyId: string;
  partnerVarietyId: string;
  compatibility: string; // good|partial|incompatible
}

export interface PollinationResult {
  need_two: boolean;
  recommended_partners: { id: string; name: string }[]; // variety id + name pairs
  note: string | null;
}

/** Check if two sex types are compatible for pollination */
function sexCompatible(a: string, b: string): boolean {
  if (a === 'hermaphrodite' || b === 'hermaphrodite') return true;
  if (a === 'monoecious' || b === 'monoecious') return true;
  if ((a === 'male' && b === 'female') || (a === 'female' && b === 'male')) return true;
  return false;
}

/** v1.4 §3.6 usage logic: profile -> compat rows -> bloom group fallback with sex check. */
export function resolvePollination(
  profile: PollinationProfileInput | null,
  compatRows: PollinationCompatRow[],
  allVarieties: { id: string; name: string; bloomGroup?: string | null; sexType?: string | null }[],
): PollinationResult {
  if (!profile) return { need_two: false, recommended_partners: [], note: null };

  const goodPartners = compatRows
    .filter((r) => r.varietyId === profile.varietyId && r.compatibility === 'good')
    .map((r) => r.partnerVarietyId);

  let partnerIds = goodPartners;
  if (partnerIds.length === 0 && profile.bloomGroup) {
    // fallback: same crop, same bloom group, compatible sex
    partnerIds = allVarieties
      .filter((v) => {
        if (v.id === profile.varietyId) return false;
        if (v.bloomGroup !== profile.bloomGroup) return false;
        if (!v.sexType) return true; // no sex info = permissive fallback
        return sexCompatible(profile.sexType, v.sexType);
      })
      .map((v) => v.id);
  }

  const partners = partnerIds
    .map((id) => allVarieties.find((v) => v.id === id))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .map((v) => ({ id: v.id, name: v.name }));

  if (profile.crossRequired) {
    return {
      need_two: true,
      recommended_partners: partners,
      note: partners.length > 0 ? `需要同时种两株，建议搭配：${partners.map((p) => p.name).join('、')}` : '需要异品种授粉，建议同时种两株',
    };
  }
  if (profile.selfFertility === 'partially_self_fertile' && partners.length > 0) {
    return {
      need_two: false,
      recommended_partners: partners,
      note: `单株可以结果，搭配 ${partners.map((p) => p.name).join('、')} 产量更高（可选）`,
    };
  }
  return { need_two: false, recommended_partners: partners, note: profile.notes };
}
