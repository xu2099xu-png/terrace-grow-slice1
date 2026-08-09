import { describe, expect, it } from 'vitest';
import { makeFact } from '../context/ai-facts';
import { validateProviderOutput } from './ai-output.validator';

const facts = [
  makeFact('crop.name', '作物', '蓝莓')!,
  makeFact('plan.status', '适合度', 'suitable')!,
  makeFact('sun.hours', '日照', 6, 'h')!,
];

describe('Slice 5 AI output validator', () => {
  it('accepts plain sentences grounded by cited facts', () => {
    const result = validateProviderOutput({
      sentences: [
        { text: '蓝莓适合当前方案。', fact_ids: ['crop.name', 'plan.status'] },
        { text: '日照是6h。', fact_ids: ['sun.hours'] },
      ],
    }, facts);

    expect(result.answer).toBe('蓝莓适合当前方案。 日照是6h。');
    expect(result.citations.map((c) => c.fact_id)).toEqual(['crop.name', 'plan.status', 'sun.hours']);
  });

  it('rejects provider warnings and every unknown provider field', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['crop.name', 'plan.status'] }],
      warnings: ['provider text must not become public warnings'],
    } as any, facts)).toThrow(/unknown fields/);
  });

  it('rejects domain terms not present in the sentence cited facts', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['crop.name'] }],
    }, facts)).toThrow(/uncited domain term/);
  });

  it('rejects context-external crop/entity tokens even when cited facts are otherwise valid', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '番茄也适合当前方案。', fact_ids: ['crop.name', 'plan.status'] }],
    }, facts)).toThrow(/unknown lexical token|uncited domain term/);
  });

  it('rejects uncited enum tokens under the positive sentence allowlist', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓是suitable。', fact_ids: ['crop.name'] }],
    }, facts)).toThrow(/uncited domain term|unknown lexical token/);
  });

  it('rejects sentinel and any other unknown fact id', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓适合当前方案。', fact_ids: ['__first__'] }],
    }, facts)).toThrow(/unknown facts/);
  });

  it('rejects uncited numbers, dates, percentages, and unit quantities', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '日照是8h。', fact_ids: ['sun.hours'] }],
    }, facts)).toThrow(/uncited unit value|uncited number/);
  });

  it('rejects HTML markdown and URLs', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓适合，详情见 https://example.test', fact_ids: ['crop.name', 'plan.status'] }],
    }, facts)).toThrow(/plain text/);
  });
});
