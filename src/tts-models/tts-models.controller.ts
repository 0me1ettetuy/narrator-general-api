import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard.js';
import type { JwtPayload } from '../auth/types/jwt.type.js';
import {
  FishCredentialResponseDto,
  FishVoiceResponseDto,
  TtsModelSelectionResponseDto,
  TtsModelsResponseDto,
} from './contracts/tts-models.openapi.js';
import type {
  FishCredentialResponse,
  FishVoiceResponse,
  TtsModelSelectionResponse,
  TtsModelsResponse,
} from './contracts/tts-models.response.js';
import { SaveFishCredentialDto } from './dto/save-fish-credential.dto.js';
import { AddFishVoiceDto } from './dto/add-fish-voice.dto.js';
import { FishVoiceIdParamsDto } from './dto/fish-voice-id-params.dto.js';
import { SelectFishVoiceDto } from './dto/select-fish-voice.dto.js';
import { SelectTtsModelDto } from './dto/select-tts-model.dto.js';
import { FishCredentialService } from './fish-credential.service.js';
import { FishVoiceService } from './fish-voice.service.js';
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
    private readonly fishVoices: FishVoiceService,
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

  @Put('selection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the user’s default TTS model' })
  @ApiBody({ type: SelectTtsModelDto })
  @ApiOkResponse({ type: TtsModelSelectionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'TTS model does not exist' })
  @ApiConflictResponse({ description: 'TTS model is unavailable' })
  @UseGuards(JwtAccessGuard)
  selectModel(
    @Req() request: RequestWithUser,
    @Body() dto: SelectTtsModelDto,
  ): Promise<TtsModelSelectionResponse> {
    return this.ttsModelsService.selectModel(request.user.sub, dto.modelId);
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

  @Post('providers/fish-audio/voices')
  @ApiOperation({ summary: 'Save a Fish Audio reference voice for the user' })
  @ApiBody({ type: AddFishVoiceDto })
  @ApiCreatedResponse({ type: FishVoiceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiConflictResponse({ description: 'Fish voice is already saved' })
  @UseGuards(JwtAccessGuard)
  addFishVoice(
    @Req() request: RequestWithUser,
    @Body() dto: AddFishVoiceDto,
  ): Promise<FishVoiceResponse> {
    return this.fishVoices.addVoice(request.user.sub, dto);
  }

  @Put('providers/fish-audio/voices/selection')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select a Fish Audio voice for future generation',
  })
  @ApiBody({ type: SelectFishVoiceDto })
  @ApiOkResponse({ type: FishVoiceResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  selectFishVoice(
    @Req() request: RequestWithUser,
    @Body() dto: SelectFishVoiceDto,
  ): Promise<FishVoiceResponse> {
    return this.fishVoices.selectVoice(request.user.sub, dto.id);
  }

  @Delete('providers/fish-audio/voices/:voiceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one custom Fish Audio voice' })
  @ApiParam({ name: 'voiceId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Fish Audio voice was removed' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @ApiNotFoundResponse({ description: 'Fish Audio voice does not exist' })
  @UseGuards(JwtAccessGuard)
  deleteFishVoice(
    @Req() request: RequestWithUser,
    @Param() params: FishVoiceIdParamsDto,
  ): Promise<void> {
    return this.fishVoices.deleteVoice(request.user.sub, params.voiceId);
  }
}
