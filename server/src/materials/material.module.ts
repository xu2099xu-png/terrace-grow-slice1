import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MaterialController, UserMaterialController } from './material.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MaterialController, UserMaterialController],
})
export class MaterialModule {}
