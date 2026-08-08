import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GovernanceService } from '../governance.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('materials')
@UseGuards(AuthGuard)
export class MaterialController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
  ) {}

  @Get()
  async list() {
    return this.prisma.substrateMaterial.findMany({
      where: this.governance.reviewStatusFilter(),
      include: { cropRules: { where: { cropId: 'crop-blueberry' } } },
    });
  }

  @Get('mine')
  async mine(@CurrentUser() userId: string) {
    const rows = await this.prisma.userMaterialInventory.findMany({
      where: { userId },
      include: { material: true },
    });
    return rows.map((r) => ({ materialId: r.materialId, name: r.material.name, level: r.level }));
  }
}

@Controller('users/me/materials')
@UseGuards(AuthGuard)
export class UserMaterialController {
  constructor(private readonly prisma: PrismaService) {}

  @Put()
  async set(@CurrentUser() userId: string, @Body('material_ids') materialIds: string[]) {
    await this.prisma.userMaterialInventory.deleteMany({ where: { userId } });
    if (!materialIds || materialIds.length === 0) return { ok: true };
    await this.prisma.userMaterialInventory.createMany({
      data: materialIds.map((id) => ({ userId, materialId: id, level: 'enough' })),
      skipDuplicates: true,
    });
    return { ok: true };
  }
}
