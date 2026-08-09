import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface AiExplanationCacheKeyInput {
  userId: string;
  contextType: string;
  contextRefs: Record<string, string>;
  contextHash: string;
  questionHash: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export interface AiExplanationCacheWriteInput {
  key: AiExplanationCacheKeyInput;
  responseJson: unknown;
  ttlSeconds: number;
  now?: Date;
}

export interface AiExplanationCacheHit {
  responseJson: CacheableAiAskResponse;
  cacheKeyHash: string;
  expiresAt: Date;
}

export interface CacheableAiCitation {
  fact_id: string;
  label: string;
  value: string | number | boolean;
  unit: string | null;
}

export interface CacheableAiAskResponse {
  status: 'answered';
  answer: string;
  source: 'ai';
  cache_hit: false;
  citations: CacheableAiCitation[];
  warnings: string[];
}

@Injectable()
export class AiExplanationCacheService {
  constructor(private readonly prisma: PrismaService) {}

  static hashQuestion(question: string): string {
    return sha256(normalizeQuestion(question));
  }

  static buildCacheKeyHash(input: AiExplanationCacheKeyInput): string {
    return sha256(canonicalJson({
      userId: required(input.userId, 'userId'),
      contextType: required(input.contextType, 'contextType'),
      contextRefs: input.contextRefs,
      contextHash: required(input.contextHash, 'contextHash'),
      questionHash: required(input.questionHash, 'questionHash'),
      provider: required(input.provider, 'provider'),
      model: required(input.model, 'model'),
      promptVersion: required(input.promptVersion, 'promptVersion'),
    }));
  }

  async read(input: AiExplanationCacheKeyInput, now = new Date()): Promise<AiExplanationCacheHit | null> {
    const cacheKeyHash = AiExplanationCacheService.buildCacheKeyHash(input);
    const row = await this.prisma.aiExplanationCache.findUnique({ where: { cacheKeyHash } });
    if (!row) return null;
    if (row.expiresAt.getTime() <= now.getTime()) {
      await this.deleteCacheKey(cacheKeyHash);
      return null;
    }
    const responseJson = validateCacheableAiResponse(row.responseJson);
    if (!responseJson) {
      await this.deleteCacheKey(cacheKeyHash);
      return null;
    }
    return {
      responseJson,
      cacheKeyHash: row.cacheKeyHash,
      expiresAt: row.expiresAt,
    };
  }

  async writeValidated(input: AiExplanationCacheWriteInput): Promise<AiExplanationCacheHit> {
    const now = input.now ?? new Date();
    const cacheKeyHash = AiExplanationCacheService.buildCacheKeyHash(input.key);
    const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000);
    const responseJson = validateCacheableAiResponse(input.responseJson);
    if (!responseJson) {
      throw new Error('AI cache responseJson is not an exact cacheable answered AI response');
    }
    try {
      const row = await this.prisma.aiExplanationCache.create({
        data: {
          userId: input.key.userId,
          cacheKeyHash,
          responseJson: responseJson as unknown as Prisma.InputJsonValue,
          provider: input.key.provider,
          model: input.key.model,
          promptVersion: input.key.promptVersion,
          expiresAt,
        },
      });
      return { responseJson, cacheKeyHash: row.cacheKeyHash, expiresAt: row.expiresAt };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const winner = await this.prisma.aiExplanationCache.findUnique({ where: { cacheKeyHash } });
      if (!winner) throw error;
      const winnerResponse = validateCacheableAiResponse(winner.responseJson);
      if (!winnerResponse) {
        await this.deleteCacheKey(cacheKeyHash);
        throw new Error('Concurrent AI cache winner is corrupt');
      }
      return {
        responseJson: winnerResponse,
        cacheKeyHash: winner.cacheKeyHash,
        expiresAt: winner.expiresAt,
      };
    }
  }

  async deleteExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.aiExplanationCache.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }

  private async deleteCacheKey(cacheKeyHash: string): Promise<void> {
    await this.prisma.aiExplanationCache.deleteMany({ where: { cacheKeyHash } });
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}

function required(value: string, label: string): string {
  if (!value) throw new Error(`${label} is required for AI cache key`);
  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: string }).code === 'P2002',
  );
}

function validateCacheableAiResponse(value: unknown): CacheableAiAskResponse | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, ['answer', 'cache_hit', 'citations', 'source', 'status', 'warnings'])) return null;
  if (value.status !== 'answered') return null;
  if (value.source !== 'ai') return null;
  if (value.cache_hit !== false) return null;
  if (typeof value.answer !== 'string') return null;
  if (!Array.isArray(value.citations)) return null;
  if (!Array.isArray(value.warnings)) return null;

  const citations = value.citations.map(validateCitation);
  if (citations.some((citation) => citation === null)) return null;
  const warnings = value.warnings;
  if (warnings.length > 10 || warnings.some((warning) => typeof warning !== 'string')) return null;

  return {
    status: 'answered',
    answer: value.answer,
    source: 'ai',
    cache_hit: false,
    citations: citations as CacheableAiCitation[],
    warnings: warnings as string[],
  };
}

function validateCitation(value: unknown): CacheableAiCitation | null {
  if (!isRecord(value)) return null;
  if (!hasExactKeys(value, ['fact_id', 'label', 'unit', 'value'])) return null;
  if (typeof value.fact_id !== 'string' || value.fact_id.trim() === '') return null;
  if (typeof value.label !== 'string' || value.label.trim() === '') return null;
  if (!['string', 'number', 'boolean'].includes(typeof value.value)) return null;
  if (value.unit !== null && typeof value.unit !== 'string') return null;
  return {
    fact_id: value.fact_id,
    label: value.label,
    value: value.value as string | number | boolean,
    unit: value.unit,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expectedKeys.length
    && actual.every((key, index) => key === expectedKeys[index]);
}
