import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RegionsModule } from '../regions/regions.module';
import { TerraceController } from './terrace.controller';

@Module({
  imports: [PrismaModule, AuthModule, RegionsModule],
  controllers: [TerraceController],
})
export class TerraceModule {}
