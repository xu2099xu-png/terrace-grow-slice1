import { Injectable } from '@nestjs/common';
import { AiRuntimeConfigService } from '../ai-runtime-config.service';
import { AiProviderMessage, AiProviderOutput } from './ai-provider.interface';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { MockAiProvider } from './mock-ai.provider';

@Injectable()
export class AiProviderService {
  constructor(
    private readonly config: AiRuntimeConfigService,
    private readonly openAiCompatible: OpenAiCompatibleProvider,
  ) {}

  async complete(messages: AiProviderMessage[]): Promise<AiProviderOutput> {
    const config = this.config.value;
    if (config.provider === 'mock') {
      return new MockAiProvider().complete({ config, messages });
    }
    if (config.provider === 'openai_compatible') {
      return this.openAiCompatible.complete({ config, messages });
    }
    throw new Error('AI provider is off');
  }
}
