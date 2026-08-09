import { Module } from '@nestjs/common';
import { LOCATION_RESOLVER, LocationResolver } from './location-resolver.interface';
import { HttpLocationResolver } from './http-location.resolver';
import { MockLocationResolver } from './mock-location.resolver';
import { LocationController } from './location.controller';
import { AppConfigService } from '../config/runtime-config';

@Module({
  controllers: [LocationController],
  providers: [
    MockLocationResolver,
    HttpLocationResolver,
    {
      provide: LOCATION_RESOLVER,
      // LOCATION_RESOLVER=mock enables the deterministic resolver (tests/E2E).
      inject: [AppConfigService, MockLocationResolver, HttpLocationResolver],
      useFactory: (
        config: AppConfigService,
        mock: MockLocationResolver,
        http: HttpLocationResolver,
      ): LocationResolver => config.value.locationResolver === 'mock' ? mock : http,
    },
  ],
  exports: [LOCATION_RESOLVER],
})
export class LocationModule {}
