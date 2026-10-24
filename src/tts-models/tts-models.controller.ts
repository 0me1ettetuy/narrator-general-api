import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import { TtsModelsResponseDto } from './contracts/tts-models.openapi.js';
import type { TtsModelsResponse } from './contracts/tts-models.response.js';
import { TtsModelsService } from './tts-models.service.js';

@ApiTags('tts models')
@ApiBearerAuth()
@Controller('tts/models')
export class TtsModelsController {
  constructor(private readonly ttsModelsService: TtsModelsService) {}

  @Get()
  @ApiOperation({ summary: 'List local TTS models and their availability' })
  @ApiOkResponse({ type: TtsModelsResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  listModels(): Promise<TtsModelsResponse> {
    return this.ttsModelsService.listModels();
  }
}
