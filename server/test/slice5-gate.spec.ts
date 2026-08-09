import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createValidationPipe } from '../src/http/validation';
import { AskAiDto } from '../src/ai/dto/ask-ai.dto';
import { AiService } from '../src/ai/ai.service';
import { AiRuntimeConfigService } from '../src/ai/ai-runtime-config.service';
import { AiContextResolverService } from '../src/ai/context/ai-context-resolver.service';
import { makeFact } from '../src/ai/context/ai-facts';
import { RulesAnswerService } from '../src/ai/rules-answer.service';
import { AiProviderService } from '../src/ai/provider/ai-provider.service';
import { MockAiProvider } from '../src/ai/provider/mock-ai.provider';
import { AiExplanationCacheService } from '../src/ai/cache/ai-cache.service';

const fact = makeFact('crop.name', '作物', '蓝莓')!;
const statusFact = makeFact('plan.status', '适合度', 'suitable')!;

function groundedResolver() {
  return {
    resolve: vi.fn(async () => ({
      grounded: true,
      warnings: ['server warning'],
      context: {
        contextType: 'perennial_plan',
        contextRefs: { crop_id: 'crop-blueberry' },
        facts: [fact, statusFact],
        warnings: ['server warning'],
        canonicalMaterial: { facts: ['crop.name', 'plan.status'] },
      },
    })),
  } as unknown as AiContextResolverService;
}

function service(overrides: {
  provider?: 'off' | 'mock' | 'openai_compatible';
  providerModel?: string | null;
  cacheHit?: any;
  capAllowed?: boolean;
  providerOutput?: any;
  providerThrows?: boolean;
  resolver?: AiContextResolverService;
} = {}) {
  const config = {
    value: {
      provider: overrides.provider ?? 'mock',
      providerBaseUrl: 'http://localhost:1',
      providerApiKey: 'test-key',
      providerModel: Object.prototype.hasOwnProperty.call(overrides, 'providerModel') ? overrides.providerModel : 'test-model',
      providerTimeoutMs: 1000,
      promptVersion: 'test-prompt',
      cacheTtlSeconds: 60,
      dailyProviderCallCap: 10,
    },
  } as AiRuntimeConfigService;
  const resolver = overrides.resolver ?? groundedResolver();
  const cache = {
    read: vi.fn(async (_key: any) => overrides.cacheHit ?? null),
    writeValidated: vi.fn(async () => null),
  };
  const usage = {
    reserveProviderCall: vi.fn(async () => ({ reserved: overrides.capAllowed ?? true, day: '2026-08-09', callCount: 1 })),
  };
  const provider = {
    complete: vi.fn(async () => {
      if (overrides.providerThrows) throw new Error('provider failed');
      return overrides.providerOutput ?? {
        sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['crop.name', 'plan.status'] }],
      };
    }),
  } as unknown as AiProviderService;
  const ai = new AiService(config, resolver, provider, new RulesAnswerService(), cache as any, usage as any);
  return { ai, cache, usage, provider, resolver };
}

describe('Slice 5 AI gate', () => {
  it('validates exact discriminated request fields and trims question', async () => {
    const dto = plainToInstance(AskAiDto, {
      context_type: 'perennial_plan',
      question: '  为什么推荐它  ',
      crop_id: 'crop-blueberry',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.question).toBe('为什么推荐它');
  });

  it('rejects selected null and mixed context fields', async () => {
    const nullSelected = plainToInstance(AskAiDto, {
      context_type: 'perennial_plan',
      question: 'why',
      crop_id: 'crop-blueberry',
      selected_variety_id: null,
    });
    expect(await validate(nullSelected)).not.toHaveLength(0);

    const mixed = plainToInstance(AskAiDto, {
      context_type: 'seasonal_item',
      question: 'why',
      city_code: 'beijing',
      crop_id: 'crop-carrot',
      planting_id: 'planting-1',
    });
    expect(await validate(mixed)).not.toHaveLength(0);
  });

  it('uses Slice 4 validation shape for unknown fields', async () => {
    const pipe = createValidationPipe();
    await expect(pipe.transform({
      context_type: 'planting_now',
      question: 'why',
      planting_id: 'planting-1',
      context_id: 'not-allowed',
    }, { type: 'body', metatype: AskAiDto })).rejects.toMatchObject({
      response: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
      },
    });
  });

  it('returns insufficient_data before cache or provider work', async () => {
    const { ai, cache, provider } = service({
      resolver: {
        resolve: vi.fn(async () => ({ grounded: false, warnings: [] })),
      } as unknown as AiContextResolverService,
    });
    const res = await ai.ask('user-1', { context_type: 'planting_now', question: 'why', planting_id: 'planting-1' } as AskAiDto);
    expect(res).toEqual({
      status: 'insufficient_data',
      answer: '',
      source: 'rules',
      cache_hit: false,
      citations: [],
      warnings: ['当前上下文没有足够的已审核信息可解释'],
    });
    expect(cache.read).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER=off returns disabled rules and never reads cached AI', async () => {
    const { ai, cache, provider } = service({
      provider: 'off',
      cacheHit: { responseJson: { status: 'answered', answer: 'cached', source: 'ai', cache_hit: false, citations: [], warnings: [] } },
    });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('disabled');
    expect(res.source).toBe('rules');
    expect(res.cache_hit).toBe(false);
    expect(cache.read).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('returns answered source ai on cache hit before cap and provider', async () => {
    const { ai, usage, provider } = service({
      cacheHit: {
        responseJson: {
          status: 'answered',
          answer: 'cached answer',
          source: 'ai',
          cache_hit: false,
          citations: [],
          warnings: [],
        },
      },
    });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res).toMatchObject({ status: 'answered', source: 'ai', cache_hit: true, answer: 'cached answer' });
    expect(usage.reserveProviderCall).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('uses the shared cache question hash for case and whitespace normalization', async () => {
    expect(AiExplanationCacheService.hashQuestion(' WHY   BLUEBERRY? ')).toBe(
      AiExplanationCacheService.hashQuestion('why blueberry?'),
    );
    const { ai, cache } = service();
    await ai.ask('user-1', { context_type: 'perennial_plan', question: ' WHY   BLUEBERRY? ', crop_id: 'crop-blueberry' } as AskAiDto);
    await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why blueberry?', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(cache.read).toHaveBeenCalledTimes(2);
    const firstKey = cache.read.mock.calls[0]?.[0];
    const secondKey = cache.read.mock.calls[1]?.[0];
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey!.questionHash).toBe(secondKey!.questionHash);
  });

  it('mock provider uses a stable cache model when no model is configured', async () => {
    const { ai, cache } = service({ provider: 'mock', providerModel: null });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('answered');
    expect(cache.read).toHaveBeenCalledWith(expect.objectContaining({ model: 'mock-contract-v1' }));
  });

  it('daily cap returns disabled rules without provider call', async () => {
    const { ai, provider } = service({ capAllowed: false });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('disabled');
    expect(res.source).toBe('rules');
    expect(res.cache_hit).toBe(false);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('provider invalid output returns provider_unavailable rules and does not cache', async () => {
    const { ai, cache } = service({
      providerOutput: {
        sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['crop.name', 'plan.status'] }],
        warnings: ['provider warning must be rejected'],
      },
    });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('provider_unavailable');
    expect(res.source).toBe('rules');
    expect(cache.writeValidated).not.toHaveBeenCalled();
  });

  it('provider output with sentinel fact id returns provider_unavailable rules and does not cache', async () => {
    const { ai, cache } = service({
      providerOutput: {
        sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['__first__'] }],
      },
    });
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('provider_unavailable');
    expect(res.source).toBe('rules');
    expect(cache.writeValidated).not.toHaveBeenCalled();
  });

  it('valid provider output returns answered source ai and writes cache', async () => {
    const { ai, cache } = service();
    const res = await ai.ask('user-1', { context_type: 'perennial_plan', question: 'why', crop_id: 'crop-blueberry' } as AskAiDto);
    expect(res.status).toBe('answered');
    expect(res.source).toBe('ai');
    expect(res.cache_hit).toBe(false);
    expect(res.warnings).toEqual(['server warning']);
    expect(cache.writeValidated).toHaveBeenCalledTimes(1);
  });

  it('mock provider parses a real fact_id and supports deterministic test-only failure', async () => {
    const provider = new MockAiProvider();
    await expect(provider.complete({
      config: {} as any,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Grounded facts:\ncrop.name|作物|蓝莓\nQuestion: why' },
      ],
    })).resolves.toEqual({
      sentences: [{ text: '作物是蓝莓。', fact_ids: ['crop.name'] }],
    });
    await expect(provider.complete({
      config: {} as any,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'Grounded facts:\ncrop.name|作物|蓝莓\nQuestion: [mock:provider_unavailable]' },
      ],
    })).rejects.toThrow(/mock provider failure/);
  });
});
