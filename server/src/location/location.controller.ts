import { Controller, Post, Body, Get, Inject } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { Public } from '../auth/public.decorator';
import { LOCATION_RESOLVER, LocationResolver } from './location-resolver.interface';
import { Throttle } from '@nestjs/throttler';
import { ResolveLocationDto } from './dto/resolve-location.dto';

@Controller('location')
export class LocationController {
  constructor(
    @Inject(LOCATION_RESOLVER) private readonly locationResolver: LocationResolver,
    private readonly agri: AgriDataService,
  ) {}

  /** Device coordinates → city_code (AC-01/AC-02). null → manual city pick. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('resolve')
  async resolve(@Body() body: ResolveLocationDto) {
    return this.locationResolver.resolveCity(body.lat, body.lng);
  }

  /** Data-driven city list for the manual picker (AC-30). */
  @Public()
  @Get('supported-cities')
  async supportedCities() {
    return this.agri.listSupportedCities();
  }
}
