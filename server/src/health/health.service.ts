import { Injectable } from '@nestjs/common';
import { AgriDataService } from '../agri-data.service';
import { AppConfigService } from '../config/runtime-config';
import { PrismaService } from '../prisma.service';

export type ContentHealthStatus =
  | 'development_fixtures'
  | 'test_fixtures'
  | 'ready'
  | 'not_ready';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agri: AgriDataService,
    private readonly config: AppConfigService,
  ) {}

  async isReady(): Promise<boolean> {
    try {
      await this.prisma.user.count({ take: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async contentStatus(): Promise<ContentHealthStatus> {
    if (this.config.value.appEnv === 'development') return 'development_fixtures';
    if (this.config.value.appEnv === 'test') return 'test_fixtures';
    return (await this.agri.hasUsableGovernedContent()) ? 'ready' : 'not_ready';
  }
}
