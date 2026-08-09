import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'live' };
  }

  @Public()
  @Get('ready')
  async ready() {
    if (!(await this.health.isReady())) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
    return { status: 'ready' };
  }

  @Public()
  @Get('content')
  async content() {
    const status = await this.health.contentStatus();
    if (status === 'not_ready') {
      throw new ServiceUnavailableException({ status });
    }
    return { status };
  }
}
