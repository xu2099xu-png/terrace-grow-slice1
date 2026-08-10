import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { SHANGHAI_TIMEZONE, TodayContext } from './calendar.types';

export const CALENDAR_CONTEXT_CACHE = 'CALENDAR_CONTEXT_CACHE';

export interface CalendarContextCacheKey {
  date: string;
  timezone: string;
  algorithmVersion: string;
}

export interface CalendarContextCache {
  get(key: CalendarContextCacheKey): Promise<TodayContext | null>;
  set(key: CalendarContextCacheKey, value: TodayContext): Promise<void>;
}

function serializeKey(key: CalendarContextCacheKey): string {
  return `${key.date}|${key.timezone}|${key.algorithmVersion}`;
}

export class MemoryCalendarContextCache implements CalendarContextCache {
  private readonly rows = new Map<string, TodayContext>();

  async get(key: CalendarContextCacheKey): Promise<TodayContext | null> {
    return this.rows.get(serializeKey(key)) ?? null;
  }

  async set(key: CalendarContextCacheKey, value: TodayContext): Promise<void> {
    this.rows.set(serializeKey(key), value);
  }
}

const TODAY_CONTEXT_KEYS = ['date', 'weekday', 'timezone', 'lunar', 'solar_term'].sort();
const LUNAR_CONTEXT_KEYS = ['status', 'month', 'day'].sort();
const WEEKDAYS = new Set(['日', '一', '二', '三', '四', '五', '六']);

function sortedKeys(value: object): string[] {
  return Object.keys(value).sort();
}

function sameKeys(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isStrictDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function validateCalendarContextJson(
  value: unknown,
  key?: CalendarContextCacheKey,
): TodayContext | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!sameKeys(sortedKeys(value), TODAY_CONTEXT_KEYS)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.date !== 'string' || !isStrictDate(candidate.date)) return null;
  if (key && candidate.date !== key.date) return null;
  if (typeof candidate.weekday !== 'string' || !WEEKDAYS.has(candidate.weekday)) return null;
  if (candidate.timezone !== SHANGHAI_TIMEZONE) return null;
  if (key && candidate.timezone !== key.timezone) return null;
  if (!candidate.lunar || typeof candidate.lunar !== 'object' || Array.isArray(candidate.lunar)) {
    return null;
  }
  if (!sameKeys(sortedKeys(candidate.lunar), LUNAR_CONTEXT_KEYS)) return null;
  const lunar = candidate.lunar as Record<string, unknown>;
  if (lunar.status !== 'available' && lunar.status !== 'unavailable') return null;
  if (lunar.status === 'available') {
    if (typeof lunar.month !== 'string' || lunar.month.length === 0) return null;
    if (typeof lunar.day !== 'string' || lunar.day.length === 0) return null;
  } else if (lunar.month !== null || lunar.day !== null) {
    return null;
  }
  if (candidate.solar_term !== null && typeof candidate.solar_term !== 'string') return null;
  return {
    date: candidate.date,
    weekday: candidate.weekday,
    timezone: SHANGHAI_TIMEZONE,
    lunar: {
      status: lunar.status,
      month: lunar.month,
      day: lunar.day,
    },
    solar_term: candidate.solar_term,
  } as TodayContext;
}

@Injectable()
export class PrismaCalendarContextCache implements CalendarContextCache {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: CalendarContextCacheKey): Promise<TodayContext | null> {
    const row = await this.prisma.calendarContextCache.findUnique({
      where: {
        date_timezone_algorithmVersion: {
          date: key.date,
          timezone: key.timezone,
          algorithmVersion: key.algorithmVersion,
        },
      },
      select: { contextJson: true, expiresAt: true },
    });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    return validateCalendarContextJson(row.contextJson, key);
  }

  async set(key: CalendarContextCacheKey, value: TodayContext): Promise<void> {
    const contextJson = validateCalendarContextJson(value, key);
    if (!contextJson) return;
    const json = contextJson as unknown as Prisma.InputJsonValue;
    await this.prisma.calendarContextCache.upsert({
      where: {
        date_timezone_algorithmVersion: {
          date: key.date,
          timezone: key.timezone,
          algorithmVersion: key.algorithmVersion,
        },
      },
      create: {
        date: key.date,
        timezone: key.timezone,
        algorithmVersion: key.algorithmVersion,
        contextJson: json,
        expiresAt: null,
      },
      update: {
        contextJson: json,
        expiresAt: null,
      },
    });
  }
}
