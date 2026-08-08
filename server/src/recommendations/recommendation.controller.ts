import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RecommendationDataService } from './recommendation-data.service';

@Controller('recommendations')
@UseGuards(AuthGuard)
export class RecommendationController {
  constructor(private readonly recommendationData: RecommendationDataService) {}

  @Post('perennial')
  async perennial(
    @CurrentUser() userId: string,
    @Body() body: {
      crop_id: string;
      selected_container_type_id?: string;
      selected_variety_id?: string;
    },
  ) {
    const plan = await this.recommendationData.build(userId, body.crop_id, {
      selected_container_type_id: body.selected_container_type_id || null,
      selected_variety_id: body.selected_variety_id || null,
    });
    if (!plan) return { error: 'No terrace profile or crop not found' };
    return plan;
  }
}
