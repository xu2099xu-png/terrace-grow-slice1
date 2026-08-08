import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { GovernanceService } from './governance.service';

@Global()
@Module({
  providers: [PrismaService, GovernanceService],
  exports: [PrismaService, GovernanceService],
})
export class PrismaModule {}
