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
      const user = await this.prisma.user.create({ data: { status: 'active' } });
      identity = await this.prisma.userIdentity.create({
        data: { userId: user.id, provider: 'anonymous_device', providerUid: deviceId },
      });
    }
    const token = this.jwt.sign({ sub: identity.userId });
    return { token };
  }

  verify(token: string): { sub: string } {
    try {
      return this.jwt.verify<{ sub: string }>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
