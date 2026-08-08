import { Module } from '@nestjs/common';
import { LOCATION_RESOLVER, LocationResolver } from './location-resolver.interface';
import { HttpLocationResolver } from './http-location.resolver';
import { MockLocationResolver } from './mock-location.resolver';
import { LocationController } from './location.controller';

@Module({
  controllers: [LocationController],
  providers: [
    MockLocationResolver,
    HttpLocationResolver,
    {
      provide: LOCATION_RESOLVER,
      // LOCATION_RESOLVER=mock enables the deterministic resolver (tests/E2E).
      useFactory: (): LocationResolver =>
        process.env.LOCATION_RESOLVER === 'mock' ? new MockLocationResolver() : new HttpLocationResolver(),
    },
  ],
  exports: [LOCATION_RESOLVER],
})
export class LocationModule {}
