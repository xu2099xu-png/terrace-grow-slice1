import type { AskAiDto } from './dto/ask-ai.dto';

export type AiStatus = 'answered' | 'disabled' | 'provider_unavailable' | 'insufficient_data';
export type AiSource = 'ai' | 'rules';
export type AiProviderMode = 'off' | 'mock' | 'openai_compatible';

export interface AiCitation {
  fact_id: string;
  label: string;
  value: string | number | boolean;
  unit: string | null;
}

export interface AiAskResponse {
  status: AiStatus;
  answer: string;
  source: AiSource;
  cache_hit: boolean;
  citations: AiCitation[];
  warnings: string[];
}

export interface AiRuntimeConfig {
  provider: AiProviderMode;
  providerBaseUrl: string | null;
  providerApiKey: string | null;
  providerModel: string | null;
  providerTimeoutMs: number;
  promptVersion: string;
  cacheTtlSeconds: number;
  dailyProviderCallCap: number;
}

export type AiQuestionContext = AskAiDto;
