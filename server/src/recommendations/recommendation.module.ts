import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RecommendationController } from './recommendation.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [RecommendationController],
})
export class RecommendationModule {}
