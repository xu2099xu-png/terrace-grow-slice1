import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ListRegionsQueryDto } from './dto/list-regions.dto';
import { RegionDirectoryService } from './region-directory.service';

@Controller('location')
export class RegionsController {
  constructor(private readonly directory: RegionDirectoryService) {}

  @Public()
  @Get('regions')
  async regions(@Query() query: ListRegionsQueryDto) {
    return this.directory.listRegions(query.level, query.parent_admin_code ?? null);
  }

  @Public()
  @Get('popular-cities')
  async popularCities() {
    return this.directory.listPopularCities();
  }
}
