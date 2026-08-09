import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { OptionalAuthGuard } from './optional-auth.guard';
import { SeasonsService } from './seasons.service';
import { toShanghaiDateString } from '../engines/lifecycle-engine';
import { OptionalCityQueryDto } from '../http/dto/shared.dto';

@Controller('seasons')
export class SeasonsController {
  constructor(private readonly seasonsService: SeasonsService) {}

  @Public() // anonymous users are welcome (AC-01)
  @UseGuards(OptionalAuthGuard) // JWT is optional (AC-12)
  @Get('now')
  async now(@Query() query: OptionalCityQueryDto, @Req() req: any) {
    if (!query.city_code) {
      return {
        date: toShanghaiDateString(new Date()), // closure: same calendar-day as the happy path
        city_code: null,
        location_status: 'unavailable',
        climate_data_status: 'unsupported',
        weather_data_status: 'unavailable',
        has_profile: false,
        items: [],
        warnings: ['缺少城市参数'],
      };
    }
    return this.seasonsService.now(query.city_code, req.userId ?? null);
  }
}
