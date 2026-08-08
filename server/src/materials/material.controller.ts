import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('materials')
@UseGuards(AuthGuard)
export class MaterialController {
  constructor(private readonly agri: AgriDataService) {}

  /**
   * Material list with crop rules.
   * `crop_id` is an explicit input: when provided, only rules for that crop
   * are attached; when omitted, all approved rules are returned (each keeps
   * its own cropId). No hardcoded blueberry.
   */
  @Get()
  async list(@Query('crop_id') cropId?: string) {
    return this.agri.listMaterialsWithRules(cropId);
  }

  @Get('mine')
  async mine(@CurrentUser() userId: string) {
    const rows = await this.agri.getUserMaterialInventory(userId);
    return rows.map((r) => ({ materialId: r.materialId, name: r.material?.name ?? null, level: r.level }));
  }
}

@Controller('users/me/materials')
@UseGuards(AuthGuard)
export class UserMaterialController {
  constructor(private readonly agri: AgriDataService) {}

  @Put()
  async set(@CurrentUser() userId: string, @Body('material_ids') materialIds: string[]) {
    return this.agri.setUserMaterialInventory(userId, materialIds);
  }
}
