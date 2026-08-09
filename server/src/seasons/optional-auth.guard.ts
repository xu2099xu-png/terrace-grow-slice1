import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

/**
 * Optional auth (AC-12): ALWAYS allows the request. If a valid Bearer token is
 * present, exposes req.userId (or req.user); otherwise req.userId = null.
 * JWT is an enhancement condition, never an entry gate. No auth rework.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers['authorization'];
    if (header === undefined) {
      req.userId = null;
      return true;
    }
    if (typeof header !== 'string') throw new UnauthorizedException('Invalid authorization header');
    const match = /^Bearer\s+(.+)$/.exec(header);
    if (!match) throw new UnauthorizedException('Invalid authorization header');
    const payload = await this.authService.verifyActive(match[1]);
    req.userId = payload.sub;
    return true;
  }
}
