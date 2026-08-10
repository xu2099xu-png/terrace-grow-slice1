import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { CALENDAR_CONTEXT_CACHE, PrismaCalendarContextCache } from './calendar-cache';
import { LocalLunarProvider } from './local-lunar.provider';
import { LUNAR_PROVIDER } from './lunar-provider.interface';
import { TodayContextService } from './today-context.service';

@Module({
  imports: [PrismaModule],
  providers: [
    TodayContextService,
    { provide: LUNAR_PROVIDER, useClass: LocalLunarProvider },
    { provide: CALENDAR_CONTEXT_CACHE, useClass: PrismaCalendarContextCache },
  ],
  exports: [TodayContextService, LUNAR_PROVIDER, CALENDAR_CONTEXT_CACHE],
})
export class CalendarModule {}
