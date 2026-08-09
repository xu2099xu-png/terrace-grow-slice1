import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AiService } from './ai.service';
import { AskAiDto } from './dto/ask-ai.dto';
import { AiRateLimitGuard } from './rate-limit/ai-rate-limit.guard';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @UseGuards(AiRateLimitGuard)
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  ask(@CurrentUser() userId: string, @Body() body: AskAiDto) {
    return this.ai.ask(userId, body);
  }
}
