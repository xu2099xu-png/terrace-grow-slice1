import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    if (typeof header !== 'string') throw new UnauthorizedException('Authentication required');
    const match = /^Bearer\s+(.+)$/.exec(header);
    if (!match) throw new UnauthorizedException('Invalid authorization header');
    const payload = await this.authService.verifyActive(match[1]);
    req.userId = payload.sub;
    return true;
  }
}
