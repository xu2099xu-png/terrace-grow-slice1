import { describe, expect, it, vi } from 'vitest';
import { AiExplanationCacheService, AiExplanationCacheKeyInput } from './ai-cache.service';

const key: AiExplanationCacheKeyInput = {
  userId: 'user-1',
  contextType: 'seasonal_item',
  contextRefs: { crop_id: 'crop-carrot', city_code: 'beijing' },
  contextHash: 'context-hash',
  questionHash: 'question-hash',
  provider: 'openai_compatible',
  model: 'contract-model',
  promptVersion: 'slice5-v1',
};

const validResponse = {
  status: 'answered' as const,
  answer: '蓝莓适合当前方案。',
  source: 'ai' as const,
  cache_hit: false as const,
  citations: [
    { fact_id: 'crop.name', label: '作物', value: '蓝莓', unit: null },
    { fact_id: 'score', label: '得分', value: 80, unit: '%' },
  ],
  warnings: ['server warning'],
};

describe('AiExplanationCacheService', () => {
  it('builds a deterministic key hash including provider, model, and prompt version', () => {
    const reordered = {
      ...key,
      contextRefs: { city_code: 'beijing', crop_id: 'crop-carrot' },
    };
    expect(AiExplanationCacheService.buildCacheKeyHash(reordered)).toBe(
      AiExplanationCacheService.buildCacheKeyHash(key),
    );
    expect(AiExplanationCacheService.buildCacheKeyHash({ ...key, provider: 'mock' })).not.toBe(
      AiExplanationCacheService.buildCacheKeyHash(key),
    );
    expect(AiExplanationCacheService.buildCacheKeyHash({ ...key, model: 'other-model' })).not.toBe(
      AiExplanationCacheService.buildCacheKeyHash(key),
    );
    expect(AiExplanationCacheService.buildCacheKeyHash({ ...key, promptVersion: 'slice5-v2' })).not.toBe(
      AiExplanationCacheService.buildCacheKeyHash(key),
    );
  });

  it('normalizes only question text into a hash and never needs the raw question for cache key input', () => {
    expect(AiExplanationCacheService.hashQuestion('  Why   this crop? ')).toBe(
      AiExplanationCacheService.hashQuestion('why this crop?'),
    );
    expect(AiExplanationCacheService.hashQuestion('  蓝莓　WHY\nNOW  ')).toBe(
      AiExplanationCacheService.hashQuestion('蓝莓 why now'),
    );
  });

  it('misses expired rows', async () => {
    const expiresAt = new Date('2026-08-09T00:00:00.000Z');
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const prisma: any = {
      aiExplanationCache: {
        findUnique: async () => ({
          responseJson: validResponse,
          cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key),
          expiresAt,
        }),
        deleteMany,
      },
    };
    const service = new AiExplanationCacheService(prisma);
    await expect(service.read(key, new Date('2026-08-09T00:00:00.000Z'))).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({ where: { cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key) } });
  });

  it('misses and removes corrupt rows', async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const prisma: any = {
      aiExplanationCache: {
        findUnique: async () => ({
          responseJson: { status: 'answered', answer: 'cached', source: 'cache' },
          cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key),
          expiresAt: new Date('2026-08-10T00:00:00.000Z'),
        }),
        deleteMany,
      },
    };
    const service = new AiExplanationCacheService(prisma);
    await expect(service.read(key, new Date('2026-08-09T00:00:00.000Z'))).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({ where: { cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key) } });
  });

  it('rejects non-cacheable public response shapes and privacy-bearing fields', async () => {
    const prisma: any = {
      aiExplanationCache: {
        create: vi.fn(),
      },
    };
    const service = new AiExplanationCacheService(prisma);
    for (const responseJson of [
      { status: 'answered', source: 'ai' },
      { ...validResponse, source: 'rules' },
      { ...validResponse, cache_hit: true },
      { ...validResponse, context: { facts: [] } },
      { ...validResponse, raw_question: 'why' },
      { ...validResponse, prompt: 'secret prompt' },
      { ...validResponse, jwt: 'token' },
      { ...validResponse, api_key: 'secret' },
      { ...validResponse, citations: [{ fact_id: 'crop.name', label: '作物', value: '蓝莓', unit: null, raw_context: 'x' }] },
    ]) {
      await expect(service.writeValidated({ key, responseJson, ttlSeconds: 60 })).rejects.toThrow(
        'exact cacheable answered AI response',
      );
    }
    expect(prisma.aiExplanationCache.create).not.toHaveBeenCalled();
  });

  it('writes only exact answered AI responses', async () => {
    const expiresAt = new Date('2026-08-10T00:00:00.000Z');
    const create = vi.fn(async () => ({
      responseJson: validResponse,
      cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key),
      expiresAt,
    }));
    const prisma: any = {
      aiExplanationCache: { create },
    };
    const service = new AiExplanationCacheService(prisma);
    await expect(service.writeValidated({
      key,
      responseJson: validResponse,
      ttlSeconds: 60,
      now: new Date('2026-08-09T00:00:00.000Z'),
    })).resolves.toEqual({
      responseJson: validResponse,
      cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key),
      expiresAt,
    });
    const [createArgs] = create.mock.calls[0] as unknown as [{ data: { responseJson: unknown } }];
    expect(createArgs.data.responseJson).toEqual(validResponse);
  });

  it('re-reads the winning cache row after a concurrent unique conflict', async () => {
    const expiresAt = new Date('2026-08-10T00:00:00.000Z');
    const winner = {
      responseJson: validResponse,
      cacheKeyHash: AiExplanationCacheService.buildCacheKeyHash(key),
      expiresAt,
    };
    const prisma: any = {
      aiExplanationCache: {
        create: async () => {
          const error: any = new Error('duplicate');
          error.code = 'P2002';
          throw error;
        },
        findUnique: async () => winner,
      },
    };
    const service = new AiExplanationCacheService(prisma);
    await expect(service.writeValidated({
      key,
      responseJson: validResponse,
      ttlSeconds: 60,
      now: new Date('2026-08-09T00:00:00.000Z'),
    })).resolves.toEqual(winner);
  });
});
