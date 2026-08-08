import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RecommendationController } from './recommendation.controller';
import { RecommendationDataService } from './recommendation-data.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RecommendationController],
  providers: [RecommendationDataService],
  exports: [RecommendationDataService],
})
export class RecommendationModule {}
