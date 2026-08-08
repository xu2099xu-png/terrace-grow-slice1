/**
 * recommend-engine / waterlogging risk — pure functions.
 * v1.3 §5.4: lookup into WaterRiskConfig banded rows.
 */

export interface WaterRiskConfigRow {
  sensitivityBand: string; // low(1-2)|mid(3)|high(4-5)
  containerDrainageBand: string;
  mixDrainageBand: string;
  rainExposed: boolean;
  riskLevel: string; // low|mid|high
  mitigation: string[];
}

export interface WaterRiskResult {
  level: 'low' | 'mid' | 'high';
  mitigation: string[];
}

function band15(v: number): string {
  if (v <= 2) return 'low';
  if (v <= 3) return 'mid';
  return 'high';
}

function bandMix(score: number): string {
  if (score < 2.5) return 'low';
  if (score <= 3.5) return 'mid';
  return 'high';
}

export function assessWaterRisk(
  sensitivity: number, // crop waterlogging_sensitivity 1-5
  containerDrainage: number, // ContainerType.drainage 1-5
  mixDrainageScore: number, // computed mix drainage 0-5
  rainExposed: boolean,
  config: WaterRiskConfigRow[],
): WaterRiskResult {
  const row = config.find(
    (r) =>
      r.sensitivityBand === band15(sensitivity) &&
      r.containerDrainageBand === band15(containerDrainage) &&
      r.mixDrainageBand === bandMix(mixDrainageScore) &&
      r.rainExposed === rainExposed,
  );
  if (!row) return { level: 'mid', mitigation: ['注意雨后及时倒掉托盘积水'] };
  return { level: row.riskLevel as WaterRiskResult['level'], mitigation: row.mitigation ?? [] };
}
