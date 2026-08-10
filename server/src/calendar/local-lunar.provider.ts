import { Injectable } from '@nestjs/common';
import {
  CALENDAR_SUPPORTED_END,
  CALENDAR_SUPPORTED_START,
} from './calendar.types';
import { LunarProvider, LunarProviderResult } from './lunar-provider.interface';

const { Solar } = require('lunar-javascript');

function isSupportedDate(date: string): boolean {
  return date >= CALENDAR_SUPPORTED_START && date <= CALENDAR_SUPPORTED_END;
}

@Injectable()
export class LocalLunarProvider implements LunarProvider {
  compute(date: string): LunarProviderResult {
    if (!isSupportedDate(date)) {
      return {
        lunar: { status: 'unavailable', month: null, day: null },
        solarTerm: null,
      };
    }
    try {
      const [year, month, day] = date.split('-').map(Number);
      const lunar = Solar.fromYmd(year, month, day).getLunar();
      return {
        lunar: {
          status: 'available',
          month: lunar.getMonthInChinese(),
          day: lunar.getDayInChinese(),
        },
        solarTerm: lunar.getJieQi() || null,
      };
    } catch {
      return {
        lunar: { status: 'unavailable', month: null, day: null },
        solarTerm: null,
      };
    }
  }
}
