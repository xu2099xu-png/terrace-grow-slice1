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

  it('accepts exact cited unit quantities with or without spaces', () => {
    const traceFacts = [makeFact('sun.hours.max', '日照', 16, 'h')!];

    expect(validateProviderOutput({
      sentences: [{ text: '日照是16h。', fact_ids: ['sun.hours.max'] }],
    }, traceFacts).answer).toBe('日照是16h。');
    expect(validateProviderOutput({
      sentences: [{ text: '日照是16 h。', fact_ids: ['sun.hours.max'] }],
    }, traceFacts).answer).toBe('日照是16 h。');
  });

  it('rejects numeric substrings inside cited unit quantities', () => {
    const traceFacts = [makeFact('sun.hours.max', '日照', 16, 'h')!];

    expect(() => validateProviderOutput({
      sentences: [{ text: '日照是6h。', fact_ids: ['sun.hours.max'] }],
    }, traceFacts)).toThrow(/uncited unit value|uncited number/);
    expect(() => validateProviderOutput({
      sentences: [{ text: '日照是6 h。', fact_ids: ['sun.hours.max'] }],
    }, traceFacts)).toThrow(/uncited unit value|uncited number/);
  });

  it('rejects numeric substrings inside cited percentages', () => {
    const traceFacts = [makeFact('water.risk.percent', '比例', 15, '%')!];

    expect(() => validateProviderOutput({
      sentences: [{ text: '比例是5%。', fact_ids: ['water.risk.percent'] }],
    }, traceFacts)).toThrow(/uncited percentage|uncited unit value|uncited number/);
  });

  it('accepts exact full dates but rejects date fragments', () => {
    const traceFacts = [makeFact('planting.as_of_date', '当前日期', '2026-08-09')!];

    expect(validateProviderOutput({
      sentences: [{ text: '当前日期是2026-08-09。', fact_ids: ['planting.as_of_date'] }],
    }, traceFacts).answer).toBe('当前日期是2026-08-09。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '当前日期是2026。', fact_ids: ['planting.as_of_date'] }],
    }, traceFacts)).toThrow(/uncited number/);
    expect(() => validateProviderOutput({
      sentences: [{ text: '当前日期是09。', fact_ids: ['planting.as_of_date'] }],
    }, traceFacts)).toThrow(/uncited number/);
    expect(() => validateProviderOutput({
      sentences: [{ text: '当前日期是2026-08。', fact_ids: ['planting.as_of_date'] }],
    }, traceFacts)).toThrow(/uncited number/);
  });

  it('preserves signs when matching unit quantities', () => {
    const negativeFacts = [makeFact('weather.low', '低温', -6, '℃')!];
    const positiveFacts = [makeFact('weather.low', '低温', 6, '℃')!];

    expect(validateProviderOutput({
      sentences: [{ text: '低温是-6℃。', fact_ids: ['weather.low'] }],
    }, negativeFacts).answer).toBe('低温是-6℃。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '低温是6℃。', fact_ids: ['weather.low'] }],
    }, negativeFacts)).toThrow(/uncited unit value|uncited number/);
    expect(() => validateProviderOutput({
      sentences: [{ text: '低温是-6℃。', fact_ids: ['weather.low'] }],
    }, positiveFacts)).toThrow(/uncited unit value|uncited number/);
  });

  it('rejects decimal substrings inside cited unit quantities', () => {
    const traceFacts = [makeFact('container.volume', '容积', 11.5, 'L')!];

    expect(() => validateProviderOutput({
      sentences: [{ text: '容积是1.5L。', fact_ids: ['container.volume'] }],
    }, traceFacts)).toThrow(/uncited unit value|uncited number/);
  });

  it('uses the exact cited unit string without unit aliases', () => {
    const sixHourFacts = [makeFact('sun.hours.zh', '日照', 6, '小时')!];
    const sixteenHourFacts = [makeFact('sun.hours.zh', '日照', 16, '小时')!];

    expect(validateProviderOutput({
      sentences: [{ text: '日照是6小时。', fact_ids: ['sun.hours.zh'] }],
    }, sixHourFacts).answer).toBe('日照是6小时。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '日照是6小时。', fact_ids: ['sun.hours.zh'] }],
    }, sixteenHourFacts)).toThrow(/uncited unit value|uncited number/);
  });

  it('requires the full cited range for unit-bearing range quantities', () => {
    const traceFacts = [makeFact('container.volume.range', '容积', '20-30', 'L')!];

    expect(validateProviderOutput({
      sentences: [{ text: '容积是20-30L。', fact_ids: ['container.volume.range'] }],
    }, traceFacts).answer).toBe('容积是20-30L。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '容积是30L。', fact_ids: ['container.volume.range'] }],
    }, traceFacts)).toThrow(/uncited unit value/);
  });

  it('requires the full cited signed range with Chinese range delimiter', () => {
    const traceFacts = [makeFact('weather.range', '低温', '-6至-3', '℃')!];

    expect(validateProviderOutput({
      sentences: [{ text: '低温是-6至-3℃。', fact_ids: ['weather.range'] }],
    }, traceFacts).answer).toBe('低温是-6至-3℃。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '低温是-3℃。', fact_ids: ['weather.range'] }],
    }, traceFacts)).toThrow(/uncited unit value/);
  });

  it('requires the full cited signed range with hyphen delimiter', () => {
    const traceFacts = [makeFact('weather.range', '低温', '-6--3', '℃')!];

    expect(validateProviderOutput({
      sentences: [{ text: '低温是-6--3℃。', fact_ids: ['weather.range'] }],
    }, traceFacts).answer).toBe('低温是-6--3℃。');
    expect(() => validateProviderOutput({
      sentences: [{ text: '低温是-3℃。', fact_ids: ['weather.range'] }],
    }, traceFacts)).toThrow(/uncited unit value/);
  });

  it('rejects embedded longer numeric tokens', () => {
    const traceFacts = [makeFact('sun.hours.max', '日照', 16, 'h')!];

    expect(() => validateProviderOutput({
      sentences: [{ text: '日照是x16h。', fact_ids: ['sun.hours.max'] }],
    }, traceFacts)).toThrow(/unknown lexical token|uncited unit value|uncited number/);
  });

  it('rejects HTML markdown and URLs', () => {
    expect(() => validateProviderOutput({
      sentences: [{ text: '蓝莓适合，详情见 https://example.test', fact_ids: ['crop.name', 'plan.status'] }],
    }, facts)).toThrow(/plain text/);
  });
});
