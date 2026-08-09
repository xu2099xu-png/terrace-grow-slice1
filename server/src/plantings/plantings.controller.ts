import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlantingsService } from './plantings.service';
import { ResourceIdParamsDto } from '../http/dto/shared.dto';
import { CompletePlantingActionDto, CreatePlantingDto } from './dto/planting.dto';

@Controller('plantings')
@UseGuards(AuthGuard)
export class PlantingsController {
  constructor(private readonly plantings: PlantingsService) {}

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: CreatePlantingDto) {
    return this.plantings.create(userId, body);
  }

  @Get(':id')
  async getOne(@CurrentUser() userId: string, @Param() params: ResourceIdParamsDto) {
    return this.plantings.getOne(userId, params.id);
  }

  @Get(':id/now')
  async now(@CurrentUser() userId: string, @Param() params: ResourceIdParamsDto) {
    return this.plantings.now(userId, params.id);
  }

  @Post(':id/events')
  async completeAction(@CurrentUser() userId: string, @Param() params: ResourceIdParamsDto, @Body() body: CompletePlantingActionDto) {
    return this.plantings.completeAction(userId, params.id, body);
  }
}

@Controller('users/me/plantings')
@UseGuards(AuthGuard)
export class MyPlantingsController {
  constructor(private readonly plantings: PlantingsService) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    return this.plantings.listMine(userId);
  }
}
