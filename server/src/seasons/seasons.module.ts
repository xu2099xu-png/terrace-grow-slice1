import { Module } from '@nestjs/common';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { OptionalAuthGuard } from './optional-auth.guard';
import { WeatherModule } from '../weather/weather.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    WeatherModule,
    AuthModule,
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService, OptionalAuthGuard],
  exports: [SeasonsService],
})
export class SeasonsModule {}
