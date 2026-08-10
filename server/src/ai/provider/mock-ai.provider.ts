import { AiProvider, AiProviderOutput, AiProviderRequest } from './ai-provider.interface';

export class MockAiProvider implements AiProvider {
  constructor(private readonly mode: 'success' | 'failure' = 'success') {}

  async complete(request: AiProviderRequest): Promise<AiProviderOutput> {
    const rawQuestion = request.messages.find((message) => message.role === 'user')?.content ?? '';
    if (this.mode === 'failure' || rawQuestion.includes('Question: [mock:provider_unavailable]')) {
      throw new Error('mock provider failure');
    }
    const fact = firstCompactFact(rawQuestion);
    if (!fact) throw new Error('mock provider missing compact facts');
    return {
      sentences: [
        { text: `${fact.label}是${fact.value}。`, fact_ids: [fact.factId] },
      ],
    };
  }
}

function firstCompactFact(content: string): { factId: string; label: string; value: string } | null {
  for (const line of content.split('\n')) {
    const match = /^([A-Za-z0-9._:-]+)\|([^|]{1,80})\|([^|]{1,120})$/.exec(line.trim());
    if (match) return { factId: match[1], label: match[2], value: match[3] };
  }
  return null;
}
