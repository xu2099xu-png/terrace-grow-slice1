import { describe, expect, it } from 'vitest';
import { AppConfigService } from '../config/runtime-config';
import { MemoryCalendarContextCache } from './calendar-cache';
import { LocalLunarProvider } from './local-lunar.provider';
import { TodayContextService } from './today-context.service';
import { LunarProvider, LunarProviderResult } from './lunar-provider.interface';

const config = (seasonDate?: string) => ({
  value: {
    seasonDate,
    calendarAlgorithmVersion: 'terrace-calendar-lunar-javascript-1.7.7-asia-shanghai-v1',
  },
} as AppConfigService);

describe('TodayContextService', () => {
  const vectors = [
    ['2025-02-02T15:59:59Z', '2025-02-02', '日', '正', '初五', null, 'available'],
    ['2025-02-02T16:00:00Z', '2025-02-03', '一', '正', '初六', '立春', 'available'],
    ['2025-01-29', '2025-01-29', '三', '正', '初一', null, 'available'],
    ['2025-07-25', '2025-07-25', '五', '闰六', '初一', null, 'available'],
    ['2024-01-05T20:49:22Z', '2024-01-06', '六', '冬', '廿五', '小寒', 'available'],
    ['2024-06-21', '2024-06-21', '五', '五', '十六', '夏至', 'available'],
    ['2024-02-24', '2024-02-24', '六', '正', '十五', null, 'available'],
    ['1900-01-31', '1900-01-31', '三', '正', '初一', null, 'available'],
    ['1899-12-31', '1899-12-31', '日', null, null, null, 'unavailable'],
    ['2101-01-01', '2101-01-01', '六', null, null, null, 'unavailable'],
  ] as const;

  it.each(vectors)(
    'matches frozen calendar vector for %s',
    async (input, date, weekday, month, day, solarTerm, status) => {
      const service = new TodayContextService(
        config(),
        new LocalLunarProvider(),
        new MemoryCalendarContextCache(),
      );
      await expect(service.getContext(input)).resolves.toEqual({
        date,
        weekday,
        timezone: 'Asia/Shanghai',
        lunar: { status, month, day },
        solar_term: solarTerm,
      });
    },
  );

  it('uses SEASON_DATE override from runtime config', async () => {
    const service = new TodayContextService(
      config('2025-01-29'),
      new LocalLunarProvider(),
      new MemoryCalendarContextCache(),
    );
    await expect(service.getToday(new Date('2025-02-02T16:00:00Z'))).resolves.toMatchObject({
      date: '2025-01-29',
      lunar: { status: 'available', month: '正', day: '初一' },
    });
  });

  it('caches by date, timezone, and algorithm version', async () => {
    class CountingProvider implements LunarProvider {
      calls = 0;
      compute(): LunarProviderResult {
        this.calls += 1;
        return {
          lunar: { status: 'available', month: '正', day: '初一' },
          solarTerm: null,
        };
      }
    }
    const provider = new CountingProvider();
    const service = new TodayContextService(config(), provider, new MemoryCalendarContextCache());
    await service.getContext('2025-01-29');
    await service.getContext('2025-01-29');
    expect(provider.calls).toBe(1);
  });
});
