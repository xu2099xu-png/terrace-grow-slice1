import { Module } from '@nestjs/common';
import { REGION_REPOSITORY } from './region.repository';
import { PrismaRegionRepository } from './prisma-region.repository';
import { RegionDirectoryService } from './region-directory.service';
import { RegionsController } from './regions.controller';
import { AgriRegionResolverService } from './resolve-agri-region';

@Module({
  controllers: [RegionsController],
  providers: [
    RegionDirectoryService,
    AgriRegionResolverService,
    { provide: REGION_REPOSITORY, useClass: PrismaRegionRepository },
  ],
  exports: [REGION_REPOSITORY, RegionDirectoryService, AgriRegionResolverService],
})
export class RegionsModule {}
