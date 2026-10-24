import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import type { JwtPayload } from '../auth/types/jwt.type.js';
import {
  FishCredentialResponseDto,
  TtsModelsResponseDto,
} from './contracts/tts-models.openapi.js';
import type {
  FishCredentialResponse,
  TtsModelsResponse,
} from './contracts/tts-models.response.js';
import { SaveFishCredentialDto } from './dto/save-fish-credential.dto.js';
import { FishCredentialService } from './fish-credential.service.js';
import { TtsModelsService } from './tts-models.service.js';

type RequestWithUser = Request & {
  user: JwtPayload;
};

@ApiTags('tts models')
@ApiBearerAuth()
@Controller('tts/models')
export class TtsModelsController {
  constructor(
    private readonly ttsModelsService: TtsModelsService,
    private readonly fishCredentials: FishCredentialService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List TTS models available to the authenticated user',
  })
  @ApiOkResponse({ type: TtsModelsResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  listModels(@Req() request: RequestWithUser): Promise<TtsModelsResponse> {
    return this.ttsModelsService.listModels(request.user.sub);
  }

  @Put('providers/fish-audio/credential')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save and validate a Fish Audio API key' })
  @ApiBody({ type: SaveFishCredentialDto })
  @ApiOkResponse({ type: FishCredentialResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  saveFishCredential(
    @Req() request: RequestWithUser,
    @Body() dto: SaveFishCredentialDto,
  ): Promise<FishCredentialResponse> {
    return this.fishCredentials.saveAndValidate(request.user.sub, dto.apiKey);
  }

  @Delete('providers/fish-audio/credential')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove the authenticated user’s Fish Audio API key',
  })
  @ApiNoContentResponse({ description: 'Fish Audio API key was removed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  deleteFishCredential(@Req() request: RequestWithUser): Promise<void> {
    return this.fishCredentials.delete(request.user.sub);
  }
}
