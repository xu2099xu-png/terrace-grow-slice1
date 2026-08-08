import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { GovernanceService } from './governance.service';
import { AgriDataService } from './agri-data.service';

@Global()
@Module({
  providers: [PrismaService, GovernanceService, AgriDataService],
  exports: [PrismaService, GovernanceService, AgriDataService],
})
export class PrismaModule {}
