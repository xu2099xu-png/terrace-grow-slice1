import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GovernanceService } from '../governance.service';
import { Public } from '../auth/public.decorator';

@Controller('crops')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
  ) {}

  @Public()
  @Get()
  async list(@Query('life_type') lifeType?: string) {
    const where = {
      ...(lifeType ? { lifeType } : {}),
      ...this.governance.reviewStatusFilter(),
    };
    return this.prisma.crop.findMany({ where, include: { environmentRequirement: true } });
  }

  @Public()
  @Get(':id/varieties')
  async varieties(@Param('id') cropId: string) {
    const rows = await this.prisma.variety.findMany({
      where: { cropId, ...this.governance.reviewStatusFilter() },
      include: { traits: { include: { attribute: true } } },
    });
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
