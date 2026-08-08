import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SoilController } from './soil.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SoilController],
})
export class SoilModule {}
