import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [PrismaModule, JwtModule.register({
    secret: process.env.JWT_SECRET || 'dev-secret',
    signOptions: { expiresIn: '365d' },
  })],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    { provide: Reflector, useValue: new Reflector() },
  ],
  exports: [AuthGuard, AuthService, JwtModule],
})
export class AuthModule {}
