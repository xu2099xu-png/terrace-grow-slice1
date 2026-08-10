import type { AiCitation } from '../ai.types';
import type { AiFact } from '../context/ai-context.types';
import type { AiProviderOutput } from '../provider/ai-provider.interface';

const MAX_SENTENCES = 5;
const MAX_SENTENCE_CHARS = 160;
const MAX_FACTS_PER_SENTENCE = 5;
const MAX_ANSWER_CHARS = 800;
const MAX_CITATIONS = 12;
const FORBIDDEN_TEXT = /<[^>]+>|https?:\/\/|\[[^\]]+\]\([^)]+\)|```|[*#>`]/u;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const EXACT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_NUMBER_PATTERN = String.raw`[-+]?\d+(?:\.\d+)?`;
const NUMBER_RE = new RegExp(String.raw`(?<![A-Za-z0-9_.])${SIGNED_NUMBER_PATTERN}(?![A-Za-z0-9_.])`, 'g');
const PERCENT_RE = new RegExp(String.raw`(?<![A-Za-z0-9_.])${SIGNED_NUMBER_PATTERN}%(?![A-Za-z0-9_])`, 'g');
const FROZEN_TRACE_UNITS = ['h', 'L', '℃', 'cm', '天', '日', '月', '%'];
const CONNECTOR_TOKENS = new Set([
  '是',
  '为',
  '和',
  '与',
  '及',
  '或',
  '可',
  '可以',
  '按',
  '当前',
  '方案',
  '规则',
  '建议',
  '执行',
  '信息',
  '引用',
  '根据',
  '已',
  '已引用',
  '当前方案',
  '适合',
  '不适合',
  '可能',
  '临界',
  '推荐',
  '种植',
  '需要',
  '注意',
  '保持',
  '选择',
  '使用',
]);
const SEGMENTER = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new (Intl as any).Segmenter('zh', { granularity: 'word' })
  : null;

interface TraceValues {
  dates: Set<string>;
  percentages: Set<string>;
  unitValues: Set<string>;
  numbers: Set<string>;
  unitValueRe: RegExp;
}

export class AiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiValidationError';
  }
}

export interface ValidatedAiOutput {
  answer: string;
  citations: AiCitation[];
}

export function validateProviderOutput(output: AiProviderOutput, facts: AiFact[]): ValidatedAiOutput {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new AiValidationError('provider output must be an object');
  }
  const keys = Object.keys(output as any);
  if (keys.length !== 1 || keys[0] !== 'sentences') {
    throw new AiValidationError('provider output has unknown fields');
  }
  if (!Array.isArray(output.sentences) || output.sentences.length < 1 || output.sentences.length > MAX_SENTENCES) {
    throw new AiValidationError('provider sentences count is invalid');
  }

  const factsById = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const allTerms = new Set(facts.flatMap((fact) => fact.allowed_terms).filter((term) => term.length >= 2));
  const citationIds = new Set<string>();
  const sentenceTexts: string[] = [];

  for (const sentence of output.sentences) {
    if (!sentence || typeof sentence !== 'object' || Array.isArray(sentence)) {
      throw new AiValidationError('sentence must be an object');
    }
    const sentenceKeys = Object.keys(sentence);
    if (sentenceKeys.some((key) => key !== 'text' && key !== 'fact_ids')) {
      throw new AiValidationError('sentence has unknown fields');
    }
    if (typeof sentence.text !== 'string' || sentence.text.trim().length < 1 || sentence.text.length > MAX_SENTENCE_CHARS) {
      throw new AiValidationError('sentence text length is invalid');
    }
    if (FORBIDDEN_TEXT.test(sentence.text)) {
      throw new AiValidationError('sentence is not plain text');
    }
    if (!Array.isArray(sentence.fact_ids) || sentence.fact_ids.length < 1 || sentence.fact_ids.length > MAX_FACTS_PER_SENTENCE) {
      throw new AiValidationError('sentence fact_ids count is invalid');
    }
    const citedFacts = sentence.fact_ids.map((id) => factsById.get(id));
    if (citedFacts.some((fact) => !fact)) {
      throw new AiValidationError('sentence cites unknown facts');
    }
    const concreteFacts = citedFacts as AiFact[];
    validateLexicalGrounding(sentence.text, concreteFacts, allTerms);
    for (const id of sentence.fact_ids) citationIds.add(id);
    sentenceTexts.push(sentence.text.trim());
  }

  const answer = sentenceTexts.join(' ');
  if (answer.length < 1 || answer.length > MAX_ANSWER_CHARS) {
    throw new AiValidationError('answer length is invalid');
  }
  const citations = [...citationIds].slice(0, MAX_CITATIONS).map((id) => {
    const fact = factsById.get(id)!;
    return {
      fact_id: fact.fact_id,
      label: fact.label,
      value: fact.value,
      unit: fact.unit,
    };
  });
  return { answer, citations };
}

export function validateRulesAnswer(output: AiProviderOutput, facts: AiFact[]): ValidatedAiOutput {
  return validateProviderOutput(output, facts);
}

function validateLexicalGrounding(text: string, citedFacts: AiFact[], allTerms: Set<string>) {
  const citedTerms = new Set(citedFacts.flatMap((fact) => fact.allowed_terms));
  for (const term of allTerms) {
    if (containsTerm(text, term) && !citedTerms.has(term)) {
      throw new AiValidationError(`uncited domain term: ${term}`);
    }
  }

  const citedTraceValues = collectTraceValues(citedFacts);
  for (const date of text.match(DATE_RE) ?? []) {
    if (!citedTraceValues.dates.has(date)) throw new AiValidationError(`uncited date: ${date}`);
  }
  const textWithoutDates = text.replace(DATE_RE, ' ');
  for (const percentage of text.match(PERCENT_RE) ?? []) {
    if (!citedTraceValues.percentages.has(percentage)) throw new AiValidationError(`uncited percentage: ${percentage}`);
  }
  for (const unitValue of text.match(citedTraceValues.unitValueRe) ?? []) {
    const compact = unitValue.replace(/\s+/g, '');
    if (!citedTraceValues.unitValues.has(compact)) {
      throw new AiValidationError(`uncited unit value: ${unitValue}`);
    }
  }
  for (const number of textWithoutDates.match(NUMBER_RE) ?? []) {
    if (!citedTraceValues.numbers.has(number)) throw new AiValidationError(`uncited number: ${number}`);
  }

  const allowedTokens = sentenceAllowedTokens(citedFacts);
  for (const token of tokenizeText(textWithoutDates)) {
    if (isNumericOrUnitToken(token, citedTraceValues)) continue;
    if (allowedTokens.has(token) || CONNECTOR_TOKENS.has(token)) continue;
    throw new AiValidationError(`unknown lexical token: ${token}`);
  }
}

function collectTraceValues(facts: AiFact[]): TraceValues {
  const unitValueRe = unitValueRegExp(facts);
  const traceValues: TraceValues = {
    dates: new Set(),
    percentages: new Set(),
    unitValues: new Set(),
    numbers: new Set(),
    unitValueRe,
  };

  for (const fact of facts) {
    const value = String(fact.value).trim();
    if (!value) continue;
    addTraceValue(traceValues, value, unitValueRe);
    if (fact.unit) addTraceValue(traceValues, `${value}${fact.unit}`, unitValueRe);
  }

  return traceValues;
}

function addTraceValue(traceValues: TraceValues, rawValue: string, unitValueRe: RegExp) {
  const compact = rawValue.replace(/\s+/g, '');
  if (!compact) return;
  if (EXACT_DATE_RE.test(compact)) {
    traceValues.dates.add(compact);
    return;
  }
  for (const date of compact.match(DATE_RE) ?? []) traceValues.dates.add(date);
  for (const percentage of compact.match(PERCENT_RE) ?? []) traceValues.percentages.add(percentage);
  for (const unitValue of compact.match(unitValueRe) ?? []) traceValues.unitValues.add(unitValue);
  for (const number of compact.match(NUMBER_RE) ?? []) traceValues.numbers.add(number);
}

function unitValueRegExp(facts: AiFact[]): RegExp {
  const units = new Set(FROZEN_TRACE_UNITS);
  for (const fact of facts) {
    if (fact.unit?.trim()) units.add(fact.unit.trim().replace(/\s+/g, ''));
  }
  const unitPattern = [...units]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp(
    String.raw`(?<![A-Za-z0-9_.+-])${SIGNED_NUMBER_PATTERN}(?:\s*[-~至到]\s*${SIGNED_NUMBER_PATTERN})?\s*(?:${unitPattern})(?![A-Za-z0-9_./%℃-])`,
    'g',
  );
}

function containsTerm(text: string, term: string): boolean {
  if (/^[A-Za-z0-9_/-]+$/.test(term)) {
    return new RegExp(`(^|[^A-Za-z0-9_/-])${escapeRegExp(term)}($|[^A-Za-z0-9_/-])`).test(text);
  }
  return text.includes(term);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sentenceAllowedTokens(facts: AiFact[]): Set<string> {
  const tokens = new Set<string>();
  for (const fact of facts) {
    addTokenSource(tokens, fact.fact_id);
    addTokenSource(tokens, fact.label);
    addTokenSource(tokens, String(fact.value));
    if (fact.unit) addTokenSource(tokens, fact.unit);
    for (const term of fact.allowed_terms) addTokenSource(tokens, term);
  }
  return tokens;
}

function addTokenSource(tokens: Set<string>, source: string) {
  const trimmed = source.trim();
  if (!trimmed) return;
  tokens.add(trimmed);
  for (const token of tokenizeText(trimmed)) tokens.add(token);
}

function tokenizeText(text: string): string[] {
  if (SEGMENTER) {
    return [...SEGMENTER.segment(text)]
      .filter((entry) => entry.isWordLike)
      .map((entry) => entry.segment.trim())
      .filter(Boolean);
  }
  return text
    .split(/[^\p{L}\p{N}_./:%℃-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isNumericOrUnitToken(token: string, citedTraceValues: TraceValues): boolean {
  if (!/^[-+]?\d/.test(token)) return false;
  const compact = token.replace(/\s+/g, '');
  if ((compact.match(citedTraceValues.unitValueRe) ?? []).some((unitValue) => unitValue === compact)) return true;
  return citedTraceValues.numbers.has(compact) ||
    citedTraceValues.percentages.has(compact) ||
    citedTraceValues.unitValues.has(compact) ||
    citedTraceValues.dates.has(compact);
}
