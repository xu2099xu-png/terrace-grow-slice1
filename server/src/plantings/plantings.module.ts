import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RecommendationDataService } from '../recommendations/recommendation-data.service';
import { PlantingsController, MyPlantingsController } from './plantings.controller';
import { PlantingsService } from './plantings.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlantingsController, MyPlantingsController],
  providers: [PlantingsService, RecommendationDataService],
})
export class PlantingsModule {}
