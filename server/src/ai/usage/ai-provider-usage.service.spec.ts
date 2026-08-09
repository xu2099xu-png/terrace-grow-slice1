import { describe, expect, it } from 'vitest';
import { AiProviderUsageService, toShanghaiDay } from './ai-provider-usage.service';

describe('AiProviderUsageService', () => {
  it('uses Asia/Shanghai day boundaries', () => {
    expect(toShanghaiDay(new Date('2026-08-08T15:59:59.000Z'))).toBe('2026-08-08');
    expect(toShanghaiDay(new Date('2026-08-08T16:00:00.000Z'))).toBe('2026-08-09');
  });

  it('atomically reserves no more than the per-user daily cap under concurrency', async () => {
    const counts = new Map<string, number>();
    const prisma: any = {
      $queryRaw: async (query: any) => {
        const [, userId, day, provider, cap] = query.values;
        const key = `${userId}:${day}:${provider}`;
        const current = counts.get(key) ?? 0;
        if (current >= Number(cap)) return [];
        const next = current + 1;
        counts.set(key, next);
        return [{ callCount: next }];
      },
    };
    const service = new AiProviderUsageService(prisma);
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.reserveProviderCall(
        'user-1',
        'openai_compatible',
        5,
        new Date('2026-08-09T04:00:00.000Z'),
      )),
    );
    expect(results.filter((result) => result.reserved)).toHaveLength(5);
    expect(results.filter((result) => !result.reserved)).toHaveLength(7);
  });

  it('does not reserve when cap is zero', async () => {
    const prisma: any = {
      $queryRaw: async () => {
        throw new Error('must not query when cap is zero');
      },
    };
    const service = new AiProviderUsageService(prisma);
    await expect(service.reserveProviderCall(
      'user-1',
      'openai_compatible',
      0,
      new Date('2026-08-09T04:00:00.000Z'),
    )).resolves.toEqual({ reserved: false, day: '2026-08-09', callCount: null });
  });
});
