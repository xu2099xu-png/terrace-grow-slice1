import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('anonymous')
  async anonymous(@Body('device_id') deviceId: string) {
    if (!deviceId) throw new Error('device_id required');
    return this.authService.anonymous(deviceId);
  }
}
