import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarModule } from '../calendar/calendar.module';
import { RegionsModule } from '../regions/regions.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { WeatherModule } from '../weather/weather.module';
import { SeasonalHomeController } from './seasonal-home.controller';
import { SeasonalHomeService } from './seasonal-home.service';

@Module({
  imports: [
    AuthModule,
    CalendarModule,
    RegionsModule,
    SeasonsModule,
    WeatherModule,
  ],
  controllers: [SeasonalHomeController],
  providers: [SeasonalHomeService],
  exports: [SeasonalHomeService],
})
export class SeasonalHomeModule {}
