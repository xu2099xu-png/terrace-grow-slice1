import { Controller, Get, Param, Query } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { Public } from '../auth/public.decorator';

@Controller('crops')
export class CatalogController {
  constructor(private readonly agri: AgriDataService) {}

  @Public()
  @Get()
  async list(@Query('life_type') lifeType?: string) {
    return this.agri.listCrops(lifeType);
  }

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.agri.getCropDetail(id);
  }

  @Public()
  @Get(':id/varieties')
  async varieties(@Param('id') cropId: string) {
    const rows = await this.agri.listVarieties(cropId);
    return rows.map((v) => ({
      id: v.id,
      name: v.name,
      maturePeriod: v.maturePeriod,
      plantHabit: v.plantHabit,
      containerFit: v.containerFit,
      traits: v.traits.map((t) => ({
        key: t.attribute.key,
        valueNumber: t.valueNumber,
        valueMin: t.valueMin,
        valueMax: t.valueMax,
      })),
    }));
  }
}
