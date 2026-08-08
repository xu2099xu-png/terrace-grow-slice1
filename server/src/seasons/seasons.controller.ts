import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { OptionalAuthGuard } from './optional-auth.guard';
import { SeasonsService } from './seasons.service';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Public() // anonymous users are welcome (AC-01)
  @UseGuards(OptionalAuthGuard) // JWT is optional (AC-12)
  @Get('now')
  async now(@Query('city_code') cityCode: string | undefined, @Req() req: any) {
    if (!cityCode) {
      return {
        date: new Date().toISOString().slice(0, 10),
        city_code: null,
        location_status: 'unavailable',
        climate_data_status: 'unsupported',
        weather_data_status: 'unavailable',
        has_profile: false,
        items: [],
        warnings: ['缺少城市参数'],
      };
    }
    return this.seasonsService.now(cityCode, req.userId ?? null);
  }
}
