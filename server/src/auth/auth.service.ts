import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async anonymous(deviceId: string) {
    let identity = await this.prisma.userIdentity.findFirst({
      where: { provider: 'anonymous_device', providerUid: deviceId },
    });
    if (!identity) {
      try {
        identity = await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { status: 'active' } });
          return tx.userIdentity.create({
            data: { userId: user.id, provider: 'anonymous_device', providerUid: deviceId },
          });
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        identity = await this.prisma.userIdentity.findFirst({
          where: { provider: 'anonymous_device', providerUid: deviceId },
        });
        if (!identity) throw error;
      }
    }
    const token = this.jwt.sign({ sub: identity.userId });
    return { token };
  }

  async verifyActive(token: string): Promise<{ sub: string }> {
    let payload: { sub?: unknown };
    try {
      payload = this.jwt.verify<{ sub?: unknown }>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid token');
    }
    return { sub: payload.sub };
  }
}
