import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { TerraceModule } from './terraces/terrace.module';
import { CatalogModule } from './catalog/catalog.module';
import { MaterialModule } from './materials/material.module';
import { RecommendationModule } from './recommendations/recommendation.module';
import { SoilModule } from './soil/soil.module';
import { PlantingsModule } from './plantings/plantings.module';
import { SeasonsModule } from './seasons/seasons.module';
import { LocationModule } from './location/location.module';
import { AuthGuard } from './auth/auth.guard';
import { RuntimeConfigModule } from './config/runtime-config.module';
import { AppConfigService } from './config/runtime-config';
import { HealthModule } from './health/health.module';
import { clientIpTracker } from './rate-limit/client-tracker';

@Module({
  imports: [
    RuntimeConfigModule,
    JwtModule.registerAsync({
      global: true,
      imports: [RuntimeConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.value.jwtSecret,
        signOptions: { expiresIn: config.value.jwtExpiresIn as any },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [RuntimeConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        getTracker: clientIpTracker,
        throttlers: [{
          ttl: config.value.rateLimitTtlMs,
          limit: config.value.rateLimitGlobalLimit,
        }],
      }),
    }),
    PrismaModule,
    AuthModule,
    TerraceModule,
    CatalogModule,
    MaterialModule,
    RecommendationModule,
    SoilModule,
    PlantingsModule,
    SeasonsModule,
    LocationModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
