/**
 * recommend-engine / sunlight — pure functions.
 * v1.3 §5.3 four-state judgment with confidence correction (v1.4 §4.3 unchanged).
 */

export type SunlightStatus = 'MATCH' | 'BORDERLINE' | 'NO_MATCH' | 'LIKELY_NO_MATCH';

export interface SunEstimateRuleRow {
  orientation: string;
  timeObs: string;
  level: string;
  hoursMin: number;
  hoursMax: number;
  confidence: string;
}

export interface SunlightInput {
  hoursMin: number;
  hoursMax: number;
  confidence: string; // 'medium' | 'low'
}

export interface SunlightWeights {
  borderline: number; // default 0.8
  borderlineLowConfidence: number; // extra factor, default 0.9
  likelyNoMatch: number; // default 0.4
}

export const DEFAULT_SUNLIGHT_WEIGHTS: SunlightWeights = {
  borderline: 0.8,
  borderlineLowConfidence: 0.9,
  likelyNoMatch: 0.4,
};

export interface SunlightAssessment {
  status: SunlightStatus;
  weight: number; // ranking weight, 0 = hard filtered
  message: string | null; // <= 6 chars style, no hour numbers
}

/**
 * Four-state judgment (v1.3 §5.3):
 *   a >= r        -> MATCH
 *   b <  r        -> NO_MATCH (medium/high confidence, hard filter)
 *                    LIKELY_NO_MATCH when confidence = low (never filter, strong downweight)
 *   a < r <= b    -> BORDERLINE
 */
export function assessSunlight(
  input: SunlightInput,
  minRequired: number,
  weights: SunlightWeights = DEFAULT_SUNLIGHT_WEIGHTS,
): SunlightAssessment {
  const { hoursMin: a, hoursMax: b, confidence: c } = input;
  if (a >= minRequired) {
    return { status: 'MATCH', weight: 1, message: null };
  }
  if (b < minRequired) {
    if (c === 'low') {
      return {
        status: 'LIKELY_NO_MATCH',
        weight: weights.likelyNoMatch,
        message: '日照可能不足，建议先确认',
      };
    }
    return { status: 'NO_MATCH', weight: 0, message: '日照不足' };
  }
  // a < r <= b
  if (c === 'low') {
    return {
      status: 'BORDERLINE',
      weight: weights.borderline * weights.borderlineLowConfidence,
      message: '日照不确定，建议先观察',
    };
  }
  return { status: 'BORDERLINE', weight: weights.borderline, message: '日照可能稍少' };
}

/** Assisted estimation from raw orientation/time answers via SunEstimateRule data rows. */
export function estimateSunlightFromRules(
  orientation: string,
  timeObs: string,
  rules: SunEstimateRuleRow[],
): { level: string; hoursMin: number; hoursMax: number; confidence: string } | null {
  const row = rules.find((r) => r.orientation === orientation && r.timeObs === timeObs);
  if (!row) return null;
  return { level: row.level, hoursMin: row.hoursMin, hoursMax: row.hoursMax, confidence: row.confidence };
}
