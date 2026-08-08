import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
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

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '365d' },
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
  ],
  providers: [
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
