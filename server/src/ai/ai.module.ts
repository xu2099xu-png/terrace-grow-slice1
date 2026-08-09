import { Module } from '@nestjs/common';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { PlantingsModule } from '../plantings/plantings.module';
import { AiController } from './ai.controller';
import { AiRuntimeConfigService } from './ai-runtime-config.service';
import { AiService } from './ai.service';
import { AiContextResolverService } from './context/ai-context-resolver.service';
import { AiProviderService } from './provider/ai-provider.service';
import { OpenAiCompatibleProvider } from './provider/openai-compatible.provider';
import { RulesAnswerService } from './rules-answer.service';
import { ExactAiContextFieldsConstraint } from './dto/ask-ai.dto';
import { AiExplanationCacheService } from './cache/ai-cache.service';
import { AiProviderUsageService } from './usage/ai-provider-usage.service';
import { AiRateLimitGuard } from './rate-limit/ai-rate-limit.guard';
import { AiRateLimitService } from './rate-limit/ai-rate-limit.service';

@Module({
  imports: [RecommendationModule, SeasonsModule, PlantingsModule],
  controllers: [AiController],
  providers: [
    AiRuntimeConfigService,
    AiService,
    AiContextResolverService,
    AiProviderService,
    OpenAiCompatibleProvider,
    RulesAnswerService,
    ExactAiContextFieldsConstraint,
    AiExplanationCacheService,
    AiProviderUsageService,
    AiRateLimitService,
    AiRateLimitGuard,
  ],
})
export class AiModule {}
