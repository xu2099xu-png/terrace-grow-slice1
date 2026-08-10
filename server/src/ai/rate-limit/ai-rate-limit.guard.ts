import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AppConfigService } from '../../config/runtime-config';
import { AiRateLimitService } from './ai-rate-limit.service';

@Injectable()
export class AiRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: AiRateLimitService,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId = req.userId;
    const result = this.limiter.check(
      userId,
      this.config.value.aiEndpointLimit,
      this.config.value.aiEndpointTtlMs,
    );
    if (result.allowed) return true;

    const response = context.switchToHttp().getResponse();
    response.setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many AI explanation requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
