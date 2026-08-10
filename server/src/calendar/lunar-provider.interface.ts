import { LunarContext } from './calendar.types';

export const LUNAR_PROVIDER = 'LUNAR_PROVIDER';

export interface LunarProviderResult {
  lunar: LunarContext;
  solarTerm: string | null;
}

export interface LunarProvider {
  compute(date: string): LunarProviderResult;
}
