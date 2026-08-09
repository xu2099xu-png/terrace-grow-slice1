import { Controller, Get, Put, Body, Query, UseGuards } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalCropQueryDto } from '../http/dto/shared.dto';
import { SetMaterialsDto } from './dto/set-materials.dto';

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
  async list(@Query() query: OptionalCropQueryDto) {
    return this.agri.listMaterialsWithRules(query.crop_id);
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
  async set(@CurrentUser() userId: string, @Body() body: SetMaterialsDto) {
    return this.agri.setUserMaterialInventory(userId, body.material_ids);
  }
}
