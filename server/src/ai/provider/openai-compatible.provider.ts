import { Injectable } from '@nestjs/common';
import { AiProvider, AiProviderOutput, AiProviderRequest } from './ai-provider.interface';

@Injectable()
export class OpenAiCompatibleProvider implements AiProvider {
  async complete(request: AiProviderRequest): Promise<AiProviderOutput> {
    const { config, messages } = request;
    if (!config.providerBaseUrl || !config.providerApiKey || !config.providerModel) {
      throw new Error('AI provider configuration is incomplete');
    }
    if (messages.length < 2) throw new Error('AI provider messages are incomplete');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.providerTimeoutMs);
    try {
      const baseUrl = config.providerBaseUrl.replace(/\/+$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${config.providerApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.providerModel,
          messages,
          temperature: 0,
          stream: false,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) throw new Error(`AI provider HTTP ${response.status}`);
      const json: any = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('AI provider content is empty');
      }
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
        throw new Error('AI provider JSON is empty');
      }
      return parsed as AiProviderOutput;
    } finally {
      clearTimeout(timeout);
    }
  }
}
