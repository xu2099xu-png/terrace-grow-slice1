import { describe, expect, it, vi } from 'vitest';
import {
  PrismaCalendarContextCache,
  validateCalendarContextJson,
} from './calendar-cache';
import { TodayContext } from './calendar.types';

const key = {
  date: '2025-02-03',
  timezone: 'Asia/Shanghai',
  algorithmVersion: 'terrace-calendar-lunar-javascript-1.7.7-asia-shanghai-v1',
};

const context: TodayContext = {
  date: '2025-02-03',
  weekday: '一',
  timezone: 'Asia/Shanghai',
  lunar: { status: 'available', month: '正', day: '初六' },
  solar_term: '立春',
};

function prismaMock(row: unknown) {
  return {
    calendarContextCache: {
      findUnique: vi.fn().mockResolvedValue(row),
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('PrismaCalendarContextCache', () => {
  it('returns a validated cache hit for the exact public today context shape', async () => {
    const prisma = prismaMock({
      contextJson: context,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    const cache = new PrismaCalendarContextCache(prisma);
    await expect(cache.get(key)).resolves.toEqual(context);
    expect(prisma.calendarContextCache.findUnique).toHaveBeenCalledWith({
      where: {
        date_timezone_algorithmVersion: key,
      },
      select: { contextJson: true, expiresAt: true },
    });
  });

  it('treats corrupt cached JSON as a miss', async () => {
    const prisma = prismaMock({
      contextJson: { ...context, extra: 'not allowed' },
      expiresAt: null,
    });
    const cache = new PrismaCalendarContextCache(prisma);
    await expect(cache.get(key)).resolves.toBeNull();
    expect(validateCalendarContextJson({ ...context, solar_term: 123 }, key)).toBeNull();
    expect(validateCalendarContextJson({
      ...context,
      lunar: { status: 'unavailable', month: '正', day: null },
    }, key)).toBeNull();
  });

  it('treats expiresAt less than or equal to now as a stale miss', async () => {
    const prisma = prismaMock({
      contextJson: context,
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    const cache = new PrismaCalendarContextCache(prisma);
    await expect(cache.get(key)).resolves.toBeNull();
  });

  it('upserts by date, timezone, and algorithmVersion with exact public JSON only', async () => {
    const prisma = prismaMock(null);
    const cache = new PrismaCalendarContextCache(prisma);
    await cache.set(key, context);
    expect(prisma.calendarContextCache.upsert).toHaveBeenCalledWith({
      where: {
        date_timezone_algorithmVersion: key,
      },
      create: {
        date: key.date,
        timezone: key.timezone,
        algorithmVersion: key.algorithmVersion,
        contextJson: context,
        expiresAt: null,
      },
      update: {
        contextJson: context,
        expiresAt: null,
      },
    });
  });
});
