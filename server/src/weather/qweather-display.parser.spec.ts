import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  QWEATHER_CURRENT_FIXTURE,
  QWEATHER_DAILY_FIXTURE,
  QWEATHER_WARNING_FIXTURE,
  QWEATHER_WARNING_REFER_FIXTURE,
} from './qweather-contract';
import {
  parseQWeatherCurrentV1,
  parseQWeatherDailyV1,
  parseQWeatherWarningV1,
} from './qweather-display.parser';
import { adaptQWeatherDailyToDailyWeather } from './seasonal-weather.adapter';

const fixtureDir = join(__dirname, 'fixtures');

function readFixture(file: string): { body: string; json: unknown } {
  const body = readFileSync(join(fixtureDir, file), 'utf8');
  return { body, json: JSON.parse(body) };
}

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

describe('QWeather Slice 6 frozen display parsers', () => {
  it('commits canonical provider fixtures with exact bytes and SHA-256', () => {
    for (const fixture of [
      QWEATHER_CURRENT_FIXTURE,
      QWEATHER_DAILY_FIXTURE,
      QWEATHER_WARNING_FIXTURE,
      QWEATHER_WARNING_REFER_FIXTURE,
    ]) {
      const { body } = readFixture(fixture.file);
      expect(body.endsWith('\n')).toBe(false);
      expect(sha256(body)).toBe(fixture.sha256);
    }
  });

  it('parses current display weather using only frozen values', () => {
    const parsed = parseQWeatherCurrentV1(readFixture(QWEATHER_CURRENT_FIXTURE.file).json);

    expect(parsed).toEqual({
      metadataTag: 's6-current-v1-fixture',
      attributionSources: ['https://developer.qweather.com/attribution.html'],
      condition: '多云',
      conditionCode: '101',
      temperatureCurrentC: 26.4,
      humidityPercent: 72,
      precipitationMm: 0.8,
      wind: '东南风 2级 3.2m/s',
    });
  });

  it('parses daily v1 display facts and keeps agricultural frost unknown', () => {
    const parsed = parseQWeatherDailyV1(readFixture(QWEATHER_DAILY_FIXTURE.file).json, '2026-08-09');

    expect(parsed?.todayDisplay).toMatchObject({
      condition: '小雨',
      conditionCode: '305',
      precipitationMm: 3.4,
      precipitationProbabilityPercent: 64,
      humidityPercent: 78,
      wind: '南风 2级 2.1m/s',
    });
    expect(parsed?.days).toEqual([
      { date: '2026-08-09', tempMinC: 24.6, tempMaxC: 31.2 },
    ]);
    expect(adaptQWeatherDailyToDailyWeather(parsed!, '2026-08-09')).toEqual([
      {
        date: '2026-08-09',
        tempMinC: 24.6,
        tempMaxC: 31.2,
        frostRisk: 'unknown',
      },
    ]);
  });

  it('accepts warning responses with missing refer and does not invent sources', () => {
    const parsed = parseQWeatherWarningV1(readFixture(QWEATHER_WARNING_FIXTURE.file).json);

    expect(parsed).toEqual({
      ok: true,
      metadataTag: 's6-weatheralert-v1-fixture',
      zeroResult: false,
      attributionSources: [
        'https://developer.qweather.com/attribution.html',
        'Alert data may be delayed or out of date. Refer to official sources for the latest data.',
        '杭州市气象台',
      ],
      warnings: ['杭州市气象台发布暴雨蓝色预警'],
    });
  });

  it('passes through optional warning refer.sources in exact manifest order', () => {
    const parsed = parseQWeatherWarningV1(readFixture(QWEATHER_WARNING_REFER_FIXTURE.file).json);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.attributionSources).toEqual([
        'https://developer.qweather.com/attribution.html',
        'Alert data may be delayed or out of date. Refer to official sources for the latest data.',
        '杭州市气象台',
        '国家预警信息发布中心',
        '中国天气网',
      ]);
    }
  });

  it('fails closed when optional warning refer.sources is malformed', () => {
    const json = readFixture(QWEATHER_WARNING_REFER_FIXTURE.file).json as any;
    json.refer.sources = ['国家预警信息发布中心', 123];

    expect(parseQWeatherWarningV1(json)).toEqual({
      ok: false,
      malformedRefer: true,
    });
  });

  it('rejects undocumented provider paths outside the frozen parser contract', () => {
    const current = readFixture(QWEATHER_CURRENT_FIXTURE.file).json as any;
    current.now = { text: 'legacy-path' };
    expect(parseQWeatherCurrentV1(current)).toBeNull();

    const currentMetadata = readFixture(QWEATHER_CURRENT_FIXTURE.file).json as any;
    currentMetadata.metadata.zeroResult = false;
    expect(parseQWeatherCurrentV1(currentMetadata)).toBeNull();

    const daily = readFixture(QWEATHER_DAILY_FIXTURE.file).json as any;
    daily.daily = [];
    expect(parseQWeatherDailyV1(daily, '2026-08-09')).toBeNull();

    const warning = readFixture(QWEATHER_WARNING_FIXTURE.file).json as any;
    warning.alerts[0].level = 'legacy-path';
    expect(parseQWeatherWarningV1(warning)).toEqual({
      ok: false,
      malformedRefer: false,
    });
  });

  it('keeps missing or invalid ratio fields null without defaulting', () => {
    const current = readFixture(QWEATHER_CURRENT_FIXTURE.file).json as any;
    current.humidity = 1.2;
    expect(parseQWeatherCurrentV1(current)?.humidityPercent).toBeNull();

    const daily = readFixture(QWEATHER_DAILY_FIXTURE.file).json as any;
    delete daily.days[0].daytime.precipitation.probability;
    expect(parseQWeatherDailyV1(daily, '2026-08-09')?.todayDisplay.precipitationProbabilityPercent).toBeNull();
  });
});
