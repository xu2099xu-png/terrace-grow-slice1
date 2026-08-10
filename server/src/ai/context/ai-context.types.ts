import type { AiCitation } from '../ai.types';

export interface AiFact extends AiCitation {
  allowed_terms: string[];
}

export interface AiGroundedContext {
  contextType: 'perennial_plan' | 'seasonal_item' | 'planting_now';
  contextRefs: Record<string, string>;
  facts: AiFact[];
  warnings: string[];
  canonicalMaterial: unknown;
}

export interface AiContextResolveResult {
  grounded: boolean;
  context?: AiGroundedContext;
  warnings: string[];
}
