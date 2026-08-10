import { Injectable } from '@nestjs/common';
import type { AiFact } from './context/ai-context.types';
import type { AiProviderOutput } from './provider/ai-provider.interface';
import { validateRulesAnswer } from './validation/ai-output.validator';

@Injectable()
export class RulesAnswerService {
  build(facts: AiFact[]) {
    const selected = facts.slice(0, 3);
    const output: AiProviderOutput = {
      sentences: selected.map((fact) => ({
        text: `${fact.label}是${fact.value}${fact.unit ?? ''}。`,
        fact_ids: [fact.fact_id],
      })),
    };
    return validateRulesAnswer(output, facts);
  }
}
