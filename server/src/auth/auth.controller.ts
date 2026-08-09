import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Throttle } from '@nestjs/throttler';
import { AnonymousAuthDto } from './dto/anonymous-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('anonymous')
  async anonymous(@Body() body: AnonymousAuthDto) {
    return this.authService.anonymous(body.device_id);
  }
}
