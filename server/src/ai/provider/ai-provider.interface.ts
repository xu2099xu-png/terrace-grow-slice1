import type { AiRuntimeConfig } from '../ai.types';

export interface AiProviderMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AiProviderRequest {
  config: AiRuntimeConfig;
  messages: AiProviderMessage[];
}

export interface AiProviderOutput {
  sentences: Array<{ text: string; fact_ids: string[] }>;
}

export interface AiProvider {
  complete(request: AiProviderRequest): Promise<AiProviderOutput>;
}
