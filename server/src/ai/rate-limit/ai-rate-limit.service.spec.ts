import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { AiRateLimitService } from './ai-rate-limit.service';

describe('AiRateLimitService', () => {
  it('keys buckets by user id, not IP-like caller data', () => {
    const service = new AiRateLimitService();
    expect(service.check('user-1', 2, 60000, 1000).allowed).toBe(true);
    expect(service.check('user-1', 2, 60000, 2000).allowed).toBe(true);
    expect(service.check('user-1', 2, 60000, 3000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
    });
    expect(service.check('user-2', 2, 60000, 3000).allowed).toBe(true);
  });

  it('resets after the fixed window', () => {
    const service = new AiRateLimitService();
    expect(service.check('user-1', 1, 1000, 1000).allowed).toBe(true);
    expect(service.check('user-1', 1, 1000, 1500).allowed).toBe(false);
    expect(service.check('user-1', 1, 1000, 2000).allowed).toBe(true);
  });

  it('opportunistically prunes expired buckets with a bounded advancing cursor', () => {
    const service = new AiRateLimitService();
    const buckets = (service as any).buckets as Map<string, { count: number; resetAtMs: number }>;
    for (let index = 0; index < 100; index += 1) {
      buckets.set(`fresh-prefix-${index}`, { count: 1, resetAtMs: 5000 });
    }
    for (let index = 0; index < 20; index += 1) {
      buckets.set(`expired-tail-${index}`, { count: 1, resetAtMs: 1000 });
    }

    expect(buckets.size).toBe(120);
    expect(service.check('fresh-1', 1, 1000, 2000).allowed).toBe(true);
    expect(buckets.has('expired-tail-0')).toBe(true);
    expect(buckets.size).toBe(121);
    expect(service.check('fresh-2', 1, 1000, 2000).allowed).toBe(true);
    expect(buckets.has('expired-tail-0')).toBe(false);
    expect(buckets.has('expired-tail-19')).toBe(false);
    expect(buckets.size).toBe(102);
  });
});

describe('AiRateLimitGuard', () => {
  it('reads req.userId and sets Retry-After on 429', () => {
    const limiter = new AiRateLimitService();
    const guard = new AiRateLimitGuard(limiter, {
      value: { aiEndpointLimit: 1, aiEndpointTtlMs: 60000 },
    } as any);
    const headers: Record<string, string> = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ userId: 'user-1', ip: '1.1.1.1', headers: { 'x-forwarded-for': '2.2.2.2' } }),
        getResponse: () => ({ setHeader: (key: string, value: string) => { headers[key] = value; } }),
      }),
    } as any;

    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });
});
