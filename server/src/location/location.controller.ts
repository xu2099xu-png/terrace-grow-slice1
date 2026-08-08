import { Controller, Post, Body, Get, Inject } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { Public } from '../auth/public.decorator';
import { LOCATION_RESOLVER, LocationResolver } from './location-resolver.interface';

@Controller('location')
export class LocationController {
  constructor(
    @Inject(LOCATION_RESOLVER) private readonly locationResolver: LocationResolver,
    private readonly agri: AgriDataService,
  ) {}

  /** Device coordinates → city_code (AC-01/AC-02). null → manual city pick. */
  @Public()
  @Post('resolve')
  async resolve(@Body() body: { lat?: number; lng?: number }) {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return this.locationResolver.resolveCity(lat, lng);
  }

  /** Data-driven city list for the manual picker (AC-30). */
  @Public()
  @Get('supported-cities')
  async supportedCities() {
    return this.agri.listSupportedCities();
  }
}
