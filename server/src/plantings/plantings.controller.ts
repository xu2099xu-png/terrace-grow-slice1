import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlantingsService } from './plantings.service';

@Controller('plantings')
@UseGuards(AuthGuard)
export class PlantingsController {
  constructor(private readonly plantings: PlantingsService) {}

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: any) {
    return this.plantings.create(userId, body);
  }

  @Get(':id')
  async getOne(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.plantings.getOne(userId, id);
  }

  @Get(':id/now')
  async now(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.plantings.now(userId, id);
  }

  @Post(':id/events')
  async completeAction(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: any) {
    return this.plantings.completeAction(userId, id, body);
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
