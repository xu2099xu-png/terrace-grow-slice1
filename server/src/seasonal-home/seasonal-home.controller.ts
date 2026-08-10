import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { OptionalAuthGuard } from '../seasons/optional-auth.guard';
import { SeasonalHomeQueryDto } from './dto/seasonal-home-query.dto';
import { SeasonalHomeService } from './seasonal-home.service';

@Controller('seasonal')
export class SeasonalHomeController {
  constructor(private readonly seasonalHome: SeasonalHomeService) {}

  @Public()
  @UseGuards(OptionalAuthGuard)
  @Get('home')
  async home(@Query() query: SeasonalHomeQueryDto, @Req() req: any) {
    return this.seasonalHome.home(query.admin_code, req.userId ?? null);
  }
}
