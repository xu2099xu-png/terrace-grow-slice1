import { Injectable } from '@nestjs/common';
import type { AskAiDto } from './dto/ask-ai.dto';
import { AiAskResponse, AiRuntimeConfig } from './ai.types';
import { AiRuntimeConfigService } from './ai-runtime-config.service';
import type { AiFact } from './context/ai-context.types';
import { AiContextResolverService } from './context/ai-context-resolver.service';
import { compactFacts, sha256, stableStringify } from './context/ai-facts';
import { AiProviderService } from './provider/ai-provider.service';
import { RulesAnswerService } from './rules-answer.service';
import { validateProviderOutput } from './validation/ai-output.validator';
import { AiExplanationCacheService, AiExplanationCacheKeyInput } from './cache/ai-cache.service';
import { AiProviderUsageService } from './usage/ai-provider-usage.service';

const INSUFFICIENT_WARNING = '当前上下文没有足够的已审核信息可解释';
const MOCK_MODEL_ID = 'mock-contract-v1';

@Injectable()
export class AiService {
  constructor(
    private readonly config: AiRuntimeConfigService,
    private readonly resolver: AiContextResolverService,
    private readonly provider: AiProviderService,
    private readonly rules: RulesAnswerService,
    private readonly cache: AiExplanationCacheService,
    private readonly usage: AiProviderUsageService,
  ) {}

  async ask(userId: string, dto: AskAiDto): Promise<AiAskResponse> {
    const resolved = await this.resolver.resolve(userId, dto);
    if (!resolved.grounded || !resolved.context || resolved.context.facts.length === 0) {
      return this.insufficientData();
    }

    const config = this.config.value;
    if (config.provider === 'off') {
      return this.rulesResponse('disabled', resolved.context.facts, resolved.context.warnings);
    }

    const cacheKey = this.cacheKey(userId, dto, resolved.context.canonicalMaterial, config);
    const cached = await this.cache.read(cacheKey);
    if (cached) {
      const response = this.cachedResponse(cached.responseJson);
      if (response) return { ...response, status: 'answered', source: 'ai', cache_hit: true };
    }

    const reservation = await this.usage.reserveProviderCall(userId, config.provider, config.dailyProviderCallCap);
    if (!reservation.reserved) {
      return this.rulesResponse('disabled', resolved.context.facts, resolved.context.warnings);
    }

    try {
      const providerOutput = await this.provider.complete(this.messages(dto.question, resolved.context.facts));
      const validated = validateProviderOutput(providerOutput, resolved.context.facts);
      const response: AiAskResponse = {
        status: 'answered',
        answer: validated.answer,
        source: 'ai',
        cache_hit: false,
        citations: validated.citations,
        warnings: this.cleanWarnings(resolved.context.warnings),
      };
      await this.writeCache(cacheKey, response, config.cacheTtlSeconds);
      return response;
    } catch {
      return this.rulesResponse('provider_unavailable', resolved.context.facts, resolved.context.warnings);
    }
  }

  private insufficientData(): AiAskResponse {
    return {
      status: 'insufficient_data',
      answer: '',
      source: 'rules',
      cache_hit: false,
      citations: [],
      warnings: [INSUFFICIENT_WARNING],
    };
  }

  private rulesResponse(
    status: 'disabled' | 'provider_unavailable',
    facts: AiFact[],
    warnings: string[],
  ): AiAskResponse {
    const validated = this.rules.build(facts);
    return {
      status,
      answer: validated.answer,
      source: 'rules',
      cache_hit: false,
      citations: validated.citations,
      warnings: this.cleanWarnings(warnings),
    };
  }

  private messages(question: string, facts: AiFact[]) {
    return [
      {
        role: 'system' as const,
        content: 'Rewrite only cited facts into plain text JSON. Return exactly {"sentences":[{"text":"...","fact_ids":["..."]}]}. No markdown, HTML, URLs, or uncited facts.',
      },
      {
        role: 'user' as const,
        content: [
          'Grounded facts:',
          compactFacts(facts),
          `Question: ${question}`,
          'Each sentence must cite only fact_ids it uses.',
        ].join('\n'),
      },
    ];
  }

  private cacheKey(userId: string, dto: AskAiDto, canonicalContext: unknown, config: AiRuntimeConfig): AiExplanationCacheKeyInput {
    return {
      userId,
      contextType: dto.context_type,
      contextRefs: this.contextRefs(dto),
      contextHash: sha256(stableStringify(canonicalContext)),
      questionHash: AiExplanationCacheService.hashQuestion(dto.question),
      provider: config.provider,
      model: this.cacheModel(config),
      promptVersion: config.promptVersion,
    };
  }

  private cacheModel(config: AiRuntimeConfig): string {
    if (config.provider === 'mock') return config.providerModel ?? MOCK_MODEL_ID;
    return config.providerModel ?? '';
  }

  private contextRefs(dto: AskAiDto): Record<string, string> {
    if (dto.context_type === 'perennial_plan') {
      return {
        crop_id: dto.crop_id!,
        selected_container_type_id: dto.selected_container_type_id ?? '',
        selected_variety_id: dto.selected_variety_id ?? '',
      };
    }
    if (dto.context_type === 'seasonal_item') {
      return { city_code: dto.city_code!, crop_id: dto.crop_id! };
    }
    return { planting_id: dto.planting_id! };
  }

  private cleanWarnings(warnings: string[]): string[] {
    return [...new Set((warnings ?? []).filter((warning) => typeof warning === 'string' && warning.trim()).map((warning) => warning.trim()))].slice(0, 3);
  }

  private cachedResponse(value: unknown): AiAskResponse | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const response = value as AiAskResponse;
    if (response.status !== 'answered' || response.source !== 'ai') return null;
    if (typeof response.answer !== 'string' || !Array.isArray(response.citations) || !Array.isArray(response.warnings)) return null;
    return {
      status: 'answered',
      answer: response.answer,
      source: 'ai',
      cache_hit: false,
      citations: response.citations,
      warnings: response.warnings,
    };
  }

  private async writeCache(key: AiExplanationCacheKeyInput, response: AiAskResponse, ttlSeconds: number) {
    try {
      await this.cache.writeValidated({ key, responseJson: response, ttlSeconds });
    } catch {
      // Cache persistence must not alter a successfully validated answer.
    }
  }
}
