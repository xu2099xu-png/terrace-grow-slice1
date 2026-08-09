import { Controller, Get, Param, Query } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { Public } from '../auth/public.decorator';
import { ResourceIdParamsDto } from '../http/dto/shared.dto';
import { CatalogQueryDto, CropDetailQueryDto } from './dto/catalog-query.dto';

@Controller('crops')
export class CatalogController {
  constructor(private readonly agri: AgriDataService) {}

  @Public()
  @Get()
  async list(@Query() query: CatalogQueryDto) {
    return this.agri.listCrops(query.life_type);
  }

  @Public()
  @Get(':id')
  async detail(@Param() params: ResourceIdParamsDto, @Query() query: CropDetailQueryDto) {
    let zoneCode: string | undefined;
    if (query.city_code) {
      const zone = await this.agri.getClimateZoneByCity(query.city_code);
      zoneCode = zone?.code;
    }
    return this.agri.getCropDetail(params.id, zoneCode);
  }

  @Public()
  @Get(':id/varieties')
  async varieties(@Param() params: ResourceIdParamsDto) {
    const rows = await this.agri.listVarieties(params.id);
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
