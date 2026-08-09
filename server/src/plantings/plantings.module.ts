import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PlantingsController, MyPlantingsController } from './plantings.controller';
import { PlantingsService } from './plantings.service';

@Module({
  imports: [PrismaModule, AuthModule, RecommendationModule],
  controllers: [PlantingsController, MyPlantingsController],
  providers: [PlantingsService],
  exports: [PlantingsService],
})
export class PlantingsModule {}
