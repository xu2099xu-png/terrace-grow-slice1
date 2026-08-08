import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Optional auth (AC-12): ALWAYS allows the request. If a valid Bearer token is
 * present, exposes req.userId (or req.user); otherwise req.userId = null.
 * JWT is an enhancement condition, never an entry gate. No auth rework.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/, '');
    if (!token) {
      req.userId = null;
      return true;
    }
    try {
      const payload = this.jwtService.verify(token);
      req.userId = payload.sub ?? null;
    } catch {
      req.userId = null;
    }
    return true;
  }
}
