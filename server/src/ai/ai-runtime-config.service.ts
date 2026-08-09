import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/runtime-config';
import { AiRuntimeConfig, AiProviderMode } from './ai.types';

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return fallback;
}

@Injectable()
export class AiRuntimeConfigService {
  constructor(private readonly appConfig: AppConfigService) {}

  get value(): AiRuntimeConfig {
    const raw = this.appConfig.value;
    const provider = raw.aiProvider as AiProviderMode;
    return {
      provider,
      providerBaseUrl: asString(raw.aiProviderBaseUrl),
      providerApiKey: asString(raw.aiProviderApiKey),
      providerModel: asString(raw.aiProviderModel),
      providerTimeoutMs: asPositiveInt(raw.aiProviderTimeoutMs, 3500),
      promptVersion: raw.aiPromptVersion,
      cacheTtlSeconds: raw.aiExplanationCacheTtlSeconds,
      dailyProviderCallCap: raw.aiDailyProviderCallCap,
    };
  }
}
