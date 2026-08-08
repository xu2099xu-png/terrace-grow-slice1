import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';
import { OptionalAuthGuard } from './optional-auth.guard';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET || 'dev-secret' }),
    WeatherModule,
  ],
  controllers: [SeasonsController],
  providers: [SeasonsService, OptionalAuthGuard],
})
export class SeasonsModule {}
