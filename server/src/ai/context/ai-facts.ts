import { createHash } from 'crypto';
import type { AiFact } from './ai-context.types';

const EXTRA_TERMS: Record<string, string[]> = {
  direct_seed: ['direct_seed', '直播'],
  nursery_plant: ['nursery_plant', '买苗'],
  either: ['either', '买苗', '直播', '均可'],
  suitable: ['suitable', '适合'],
  borderline: ['borderline', '临界', '勉强'],
  likely_unsuitable: ['likely_unsuitable', '可能不适合'],
  unsuitable: ['unsuitable', '不适合'],
  MATCH: ['MATCH', '适合'],
  BORDERLINE: ['BORDERLINE', '临界'],
  LIKELY_NO_MATCH: ['LIKELY_NO_MATCH', '可能不适合'],
  NO_MATCH: ['NO_MATCH', '不适合'],
  available: ['available', '可用'],
  partial: ['partial', '部分可用'],
  unavailable: ['unavailable', '不可用'],
  provider_unavailable: ['provider_unavailable'],
  in_window: ['in_window', '窗口内', '当前时令'],
  too_early: ['too_early', '偏早'],
  too_late: ['too_late', '偏晚'],
  no_data: ['no_data', '无数据'],
  temp_out_of_range: ['temp_out_of_range', '温度越界'],
  frost_risk: ['frost_risk', '霜冻风险'],
  unknown: ['unknown', '未知'],
};

function stringValue(value: string | number | boolean): string {
  return String(value);
}

function splitTerms(value: string): string[] {
  return value
    .split(/[\s,，、/|:：;；()[\]{}"'`]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

export function makeFact(
  factId: string,
  label: string,
  value: string | number | boolean | null | undefined,
  unit: string | null = null,
  extraTerms: string[] = [],
): AiFact | null {
  if (value === null || value === undefined || value === '') return null;
  const rawValue = stringValue(value);
  const terms = new Set<string>([
    factId,
    label,
    rawValue,
    ...splitTerms(label),
    ...splitTerms(rawValue),
    ...(EXTRA_TERMS[rawValue] ?? []),
    ...extraTerms,
  ].filter(Boolean));
  return {
    fact_id: factId,
    label,
    value,
    unit,
    allowed_terms: [...terms],
  };
}

export function compactFacts(facts: AiFact[]): string {
  return facts
    .map((fact) => `${fact.fact_id}|${fact.label}|${fact.value}${fact.unit ?? ''}`)
    .join('\n');
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
