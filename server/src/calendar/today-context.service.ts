import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/runtime-config';
import {
  CALENDAR_ALGORITHM_VERSION,
  SHANGHAI_TIMEZONE,
  TodayContext,
} from './calendar.types';
import { LUNAR_PROVIDER, LunarProvider } from './lunar-provider.interface';
import { CALENDAR_CONTEXT_CACHE, CalendarContextCache } from './calendar-cache';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function shanghaiDateFromInstant(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function normalizeDateInput(input: Date | string): string {
  if (input instanceof Date) return shanghaiDateFromInstant(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const instant = new Date(input);
  if (Number.isNaN(instant.getTime())) {
    throw new Error('invalid today-context date input');
  }
  return shanghaiDateFromInstant(instant);
}

function weekdayForDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

@Injectable()
export class TodayContextService {
  constructor(
    private readonly config: AppConfigService,
    @Inject(LUNAR_PROVIDER) private readonly lunar: LunarProvider,
    @Inject(CALENDAR_CONTEXT_CACHE) private readonly cache: CalendarContextCache,
  ) {}

  async getToday(now: Date = new Date()): Promise<TodayContext> {
    return this.getContext(this.config.value.seasonDate ?? now);
  }

  async getContext(input: Date | string): Promise<TodayContext> {
    const date = normalizeDateInput(input);
    const algorithmVersion = this.config.value.calendarAlgorithmVersion
      ?? CALENDAR_ALGORITHM_VERSION;
    const key = { date, timezone: SHANGHAI_TIMEZONE, algorithmVersion };
    const cached = await this.cache.get(key);
    if (cached) return cached;

    const computed = this.lunar.compute(date);
    const value: TodayContext = {
      date,
      weekday: weekdayForDate(date),
      timezone: SHANGHAI_TIMEZONE,
      lunar: computed.lunar,
      solar_term: computed.solarTerm,
    };
    await this.cache.set(key, value);
    return value;
  }
}
