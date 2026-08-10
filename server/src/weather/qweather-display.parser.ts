import { addDays } from './weather-provider.interface';
import { toShanghaiDateString } from '../engines/lifecycle-engine';

export interface ParsedQWeatherCurrent {
  metadataTag: string | null;
  attributionSources: string[];
  condition: string | null;
  conditionCode: string | null;
  temperatureCurrentC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  wind: string | null;
}

export interface ParsedQWeatherDailyDay {
  date: string;
  tempMinC: number | null;
  tempMaxC: number | null;
}

export interface ParsedQWeatherDaily {
  metadataTag: string | null;
  attributionSources: string[];
  days: ParsedQWeatherDailyDay[];
  todayDisplay: {
    condition: string | null;
    conditionCode: string | null;
    precipitationMm: number | null;
    precipitationProbabilityPercent: number | null;
    humidityPercent: number | null;
    wind: string | null;
  };
}

export type ParsedQWeatherWarning =
  | {
      ok: true;
      metadataTag: string | null;
      zeroResult: boolean | null;
      attributionSources: string[];
      warnings: string[];
    }
  | {
      ok: false;
      malformedRefer: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownKeys(
  value: unknown,
  allowedKeys: readonly string[],
  path: string,
  issues: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return false;
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(`${path}.${key} is not in the frozen QWeather contract`);
  }
  return true;
}

function optionalString(value: unknown, issues: string[], path: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    issues.push(`${path} must be a string`);
    return null;
  }
  return value;
}

function optionalFiniteNumber(value: unknown, issues: string[], path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(`${path} must be a finite number`);
    return null;
  }
  return value;
}

function optionalStringArray(value: unknown, issues: string[], path: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    issues.push(`${path} must be a string array`);
    return [];
  }
  return value.slice();
}

function optionalRatioPercent(value: unknown, issues: string[], path: string): number | null {
  if (value === undefined || value === null) return null;
  const ratio = optionalFiniteNumber(value, issues, path);
  if (ratio === null) return null;
  if (ratio < 0 || ratio > 1) return null;
  return Math.round(ratio * 100);
}

function parseCelsius(value: unknown, issues: string[], path: string): number | null {
  if (value === undefined || value === null) return null;
  if (!assertKnownKeys(value, ['value', 'unit'], path, issues)) return null;
  const amount = optionalFiniteNumber(value.value, issues, `${path}.value`);
  const unit = optionalString(value.unit, issues, `${path}.unit`);
  if (amount === null) return null;
  if (unit !== '°C' && unit !== 'C') return null;
  return amount;
}

function parseAmount(value: unknown, unitName: string, issues: string[], path: string): number | null {
  if (value === undefined || value === null) return null;
  if (!assertKnownKeys(value, ['value', 'unit'], path, issues)) return null;
  const amount = optionalFiniteNumber(value.value, issues, `${path}.value`);
  const unit = optionalString(value.unit, issues, `${path}.unit`);
  if (amount === null) return null;
  return unit === unitName ? amount : null;
}

function parseWind(value: unknown, issues: string[], path: string): string | null {
  if (value === undefined || value === null) return null;
  if (!assertKnownKeys(value, ['direction', 'speed', 'scale'], path, issues)) return null;
  const direction = value.direction;
  const speed = value.speed;
  if (direction !== undefined && !assertKnownKeys(direction, ['degree', 'compass'], `${path}.direction`, issues)) {
    return null;
  }
  if (speed !== undefined && !assertKnownKeys(speed, ['value', 'unit'], `${path}.speed`, issues)) {
    return null;
  }
  const compass = isRecord(direction)
    ? optionalString(direction.compass, issues, `${path}.direction.compass`)
    : null;
  if (isRecord(direction)) optionalFiniteNumber(direction.degree, issues, `${path}.direction.degree`);
  const speedValue = isRecord(speed)
    ? optionalFiniteNumber(speed.value, issues, `${path}.speed.value`)
    : null;
  const speedUnit = isRecord(speed)
    ? optionalString(speed.unit, issues, `${path}.speed.unit`)
    : null;
  const scale = value.scale === undefined || value.scale === null
    ? null
    : typeof value.scale === 'string' || typeof value.scale === 'number'
      ? String(value.scale)
      : null;
  if (value.scale !== undefined && value.scale !== null && scale === null) {
    issues.push(`${path}.scale must be a string or number`);
  }
  const parts: string[] = [];
  if (compass) parts.push(compass);
  if (scale) parts.push(`${scale}级`);
  if (speedValue !== null && speedUnit) parts.push(`${speedValue}${speedUnit}`);
  return parts.length ? parts.join(' ') : null;
}

function parseMetadata(
  value: unknown,
  issues: string[],
  path = 'metadata',
  allowZeroResult = false,
): { tag: string | null; attributions: string[] } {
  if (value === undefined || value === null) return { tag: null, attributions: [] };
  const allowedKeys = allowZeroResult ? ['tag', 'attributions', 'zeroResult'] : ['tag', 'attributions'];
  if (!assertKnownKeys(value, allowedKeys, path, issues)) {
    return { tag: null, attributions: [] };
  }
  return {
    tag: optionalString(value.tag, issues, `${path}.tag`),
    attributions: optionalStringArray(value.attributions, issues, `${path}.attributions`),
  };
}

function parseForecastDate(value: unknown, issues: string[], path: string): string | null {
  const raw = optionalString(value, issues, path);
  if (!raw) return null;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    issues.push(`${path} must include an explicit timezone offset`);
    return null;
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) {
    issues.push(`${path} must be a valid instant`);
    return null;
  }
  return toShanghaiDateString(instant);
}

function parseCondition(
  value: unknown,
  issues: string[],
  path: string,
): { text: string | null; code: string | null } {
  if (value === undefined || value === null) return { text: null, code: null };
  if (!assertKnownKeys(value, ['text', 'code'], path, issues)) return { text: null, code: null };
  return {
    text: optionalString(value.text, issues, `${path}.text`),
    code: optionalString(value.code, issues, `${path}.code`),
  };
}

export function parseQWeatherCurrentV1(value: unknown): ParsedQWeatherCurrent | null {
  const issues: string[] = [];
  if (!assertKnownKeys(
    value,
    ['metadata', 'condition', 'temperature', 'humidity', 'wind', 'precipitation'],
    '$',
    issues,
  )) return null;
  const metadata = parseMetadata(value.metadata, issues);
  const condition = parseCondition(value.condition, issues, 'condition');
  let precipitationMm: number | null = null;
  if (value.precipitation !== undefined && value.precipitation !== null) {
    if (assertKnownKeys(value.precipitation, ['amount', 'intensity', 'type'], 'precipitation', issues)) {
      precipitationMm = parseAmount(value.precipitation.amount, 'mm', issues, 'precipitation.amount');
      parseAmount(value.precipitation.intensity, 'mm/h', issues, 'precipitation.intensity');
      optionalString(value.precipitation.type, issues, 'precipitation.type');
    }
  }
  const parsed: ParsedQWeatherCurrent = {
    metadataTag: metadata.tag,
    attributionSources: metadata.attributions,
    condition: condition.text,
    conditionCode: condition.code,
    temperatureCurrentC: parseCelsius(value.temperature, issues, 'temperature'),
    humidityPercent: optionalRatioPercent(value.humidity, issues, 'humidity'),
    precipitationMm,
    wind: parseWind(value.wind, issues, 'wind'),
  };
  return issues.length ? null : parsed;
}

function parseDaytime(value: unknown, issues: string[]) {
  if (value === undefined || value === null) {
    return {
      condition: null,
      conditionCode: null,
      precipitationMm: null,
      precipitationProbabilityPercent: null,
      humidityPercent: null,
      wind: null,
    };
  }
  if (!assertKnownKeys(value, ['condition', 'precipitation', 'humidity', 'wind'], 'days[0].daytime', issues)) {
    return {
      condition: null,
      conditionCode: null,
      precipitationMm: null,
      precipitationProbabilityPercent: null,
      humidityPercent: null,
      wind: null,
    };
  }
  const condition = parseCondition(value.condition, issues, 'days[0].daytime.condition');
  let precipitationMm: number | null = null;
  let precipitationProbabilityPercent: number | null = null;
  if (value.precipitation !== undefined && value.precipitation !== null) {
    if (assertKnownKeys(
      value.precipitation,
      ['amount', 'probability', 'type'],
      'days[0].daytime.precipitation',
      issues,
    )) {
      precipitationMm = parseAmount(
        value.precipitation.amount,
        'mm',
        issues,
        'days[0].daytime.precipitation.amount',
      );
      precipitationProbabilityPercent = optionalRatioPercent(
        value.precipitation.probability,
        issues,
        'days[0].daytime.precipitation.probability',
      );
      optionalString(value.precipitation.type, issues, 'days[0].daytime.precipitation.type');
    }
  }
  return {
    condition: condition.text,
    conditionCode: condition.code,
    precipitationMm,
    precipitationProbabilityPercent,
    humidityPercent: optionalRatioPercent(value.humidity, issues, 'days[0].daytime.humidity'),
    wind: parseWind(value.wind, issues, 'days[0].daytime.wind'),
  };
}

function validateNighttime(value: unknown, issues: string[], index: number): void {
  if (value === undefined || value === null) return;
  const prefix = `days[${index}].nighttime`;
  if (!assertKnownKeys(value, ['condition', 'precipitation', 'humidity', 'wind'], prefix, issues)) return;
  parseCondition(value.condition, issues, `${prefix}.condition`);
  if (value.precipitation !== undefined && value.precipitation !== null) {
    if (assertKnownKeys(value.precipitation, ['amount', 'probability', 'type'], `${prefix}.precipitation`, issues)) {
      parseAmount(value.precipitation.amount, 'mm', issues, `${prefix}.precipitation.amount`);
      optionalRatioPercent(value.precipitation.probability, issues, `${prefix}.precipitation.probability`);
      optionalString(value.precipitation.type, issues, `${prefix}.precipitation.type`);
    }
  }
  optionalRatioPercent(value.humidity, issues, `${prefix}.humidity`);
  parseWind(value.wind, issues, `${prefix}.wind`);
}

export function parseQWeatherDailyV1(value: unknown, today: string): ParsedQWeatherDaily | null {
  const issues: string[] = [];
  if (!assertKnownKeys(value, ['metadata', 'days'], '$', issues)) return null;
  const metadata = parseMetadata(value.metadata, issues);
  if (!Array.isArray(value.days)) return null;
  const expectedDates = [today, addDays(today, 1), addDays(today, 2)];
  const byDate = new Map<string, ParsedQWeatherDailyDay>();
  let todayDisplay = {
    condition: null as string | null,
    conditionCode: null as string | null,
    precipitationMm: null as number | null,
    precipitationProbabilityPercent: null as number | null,
    humidityPercent: null as number | null,
    wind: null as string | null,
  };
  value.days.forEach((dayValue, index) => {
    const prefix = `days[${index}]`;
    if (!assertKnownKeys(
      dayValue,
      [
        'forecastStartTime',
        'forecastEndTime',
        'temperatureMin',
        'temperatureMax',
        'daytime',
        'nighttime',
      ],
      prefix,
      issues,
    )) return;
    const date = parseForecastDate(dayValue.forecastStartTime, issues, `${prefix}.forecastStartTime`);
    parseForecastDate(dayValue.forecastEndTime, issues, `${prefix}.forecastEndTime`);
    const tempMinC = parseCelsius(dayValue.temperatureMin, issues, `${prefix}.temperatureMin`);
    const tempMaxC = parseCelsius(dayValue.temperatureMax, issues, `${prefix}.temperatureMax`);
    if (index === 0) todayDisplay = parseDaytime(dayValue.daytime, issues);
    validateNighttime(dayValue.nighttime, issues, index);
    if (!date || !expectedDates.includes(date) || byDate.has(date)) return;
    byDate.set(date, { date, tempMinC, tempMaxC });
  });
  if (issues.length) return null;
  return {
    metadataTag: metadata.tag,
    attributionSources: metadata.attributions,
    days: expectedDates.flatMap((date) => {
      const day = byDate.get(date);
      return day ? [day] : [];
    }),
    todayDisplay,
  };
}

export function parseQWeatherWarningV1(value: unknown): ParsedQWeatherWarning {
  const issues: string[] = [];
  if (!assertKnownKeys(value, ['metadata', 'alerts', 'refer'], '$', issues)) {
    return { ok: false, malformedRefer: false };
  }
  const metadata = parseMetadata(value.metadata, issues, 'metadata', true);
  const zeroResult = isRecord(value.metadata) && typeof value.metadata.zeroResult === 'boolean'
    ? value.metadata.zeroResult
    : null;
  const alertsValue = value.alerts;
  if (alertsValue !== undefined && !Array.isArray(alertsValue)) {
    issues.push('alerts must be an array');
  }
  const warnings: string[] = [];
  const senderSources: string[] = [];
  if (Array.isArray(alertsValue)) {
    alertsValue.forEach((alertValue, index) => {
      const prefix = `alerts[${index}]`;
      if (!assertKnownKeys(
        alertValue,
        [
          'id',
          'senderName',
          'issuedTime',
          'eventType',
          'severity',
          'certainty',
          'color',
          'effectiveTime',
          'onsetTime',
          'expireTime',
          'headline',
          'description',
        ],
        prefix,
        issues,
      )) return;
      optionalString(alertValue.id, issues, `${prefix}.id`);
      const senderName = optionalString(alertValue.senderName, issues, `${prefix}.senderName`);
      if (senderName !== null) senderSources.push(senderName);
      optionalString(alertValue.issuedTime, issues, `${prefix}.issuedTime`);
      if (alertValue.eventType !== undefined && alertValue.eventType !== null) {
        if (assertKnownKeys(alertValue.eventType, ['name', 'code'], `${prefix}.eventType`, issues)) {
          optionalString(alertValue.eventType.name, issues, `${prefix}.eventType.name`);
          optionalString(alertValue.eventType.code, issues, `${prefix}.eventType.code`);
        }
      }
      optionalString(alertValue.severity, issues, `${prefix}.severity`);
      optionalString(alertValue.certainty, issues, `${prefix}.certainty`);
      if (alertValue.color !== undefined && alertValue.color !== null) {
        if (assertKnownKeys(alertValue.color, ['code', 'red', 'green', 'blue', 'alpha'], `${prefix}.color`, issues)) {
          optionalString(alertValue.color.code, issues, `${prefix}.color.code`);
          optionalFiniteNumber(alertValue.color.red, issues, `${prefix}.color.red`);
          optionalFiniteNumber(alertValue.color.green, issues, `${prefix}.color.green`);
          optionalFiniteNumber(alertValue.color.blue, issues, `${prefix}.color.blue`);
          optionalFiniteNumber(alertValue.color.alpha, issues, `${prefix}.color.alpha`);
        }
      }
      optionalString(alertValue.effectiveTime, issues, `${prefix}.effectiveTime`);
      optionalString(alertValue.onsetTime, issues, `${prefix}.onsetTime`);
      optionalString(alertValue.expireTime, issues, `${prefix}.expireTime`);
      const headline = optionalString(alertValue.headline, issues, `${prefix}.headline`);
      optionalString(alertValue.description, issues, `${prefix}.description`);
      if (headline) warnings.push(headline);
    });
  }
  let referSources: string[] = [];
  let malformedRefer = false;
  if (isRecord(value.refer) && Object.prototype.hasOwnProperty.call(value.refer, 'sources')) {
    if (!Array.isArray(value.refer.sources) || value.refer.sources.some((item) => typeof item !== 'string')) {
      malformedRefer = true;
    } else {
      referSources = value.refer.sources.slice();
    }
  } else if (value.refer !== undefined && value.refer !== null) {
    if (!isRecord(value.refer)) malformedRefer = true;
    else assertKnownKeys(value.refer, ['sources'], 'refer', issues);
  }
  if (malformedRefer) return { ok: false, malformedRefer: true };
  if (issues.length) return { ok: false, malformedRefer: false };
  return {
    ok: true,
    metadataTag: metadata.tag,
    zeroResult,
    attributionSources: [
      ...metadata.attributions,
      ...senderSources,
      ...referSources,
    ],
    warnings,
  };
}
