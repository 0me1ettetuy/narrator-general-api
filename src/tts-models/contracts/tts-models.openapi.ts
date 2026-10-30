import { ApiProperty } from '@nestjs/swagger';

export class TtsModelResponseDto {
  @ApiProperty({ example: 'local.piper.en-us-amy' })
  id: string;

  @ApiProperty({ example: 'local-piper' })
  provider: string;

  @ApiProperty({ example: 'Piper — English (Amy)' })
  displayName: string;

  @ApiProperty({ enum: ['LOCAL', 'FISH'] })
  source: string;

  @ApiProperty({ enum: ['READY', 'UNAVAILABLE', 'DISABLED'] })
  status: string;

  @ApiProperty()
  selectable: boolean;

  @ApiProperty({
    nullable: true,
    enum: ['MODEL_DISABLED', 'MODEL_SERVICE_UNREACHABLE'],
  })
  reasonCode: string | null;
}

export class TtsModelGroupResponseDto {
  @ApiProperty({ enum: ['local', 'fish-audio'] })
  id: string;

  @ApiProperty({ example: 'Local models' })
  displayName: string;

  @ApiProperty({ type: () => [TtsModelResponseDto] })
  models: TtsModelResponseDto[];
}

export class FishCredentialResponseDto {
  @ApiProperty({ enum: ['fish-audio'] })
  id: 'fish-audio';

  @ApiProperty({ enum: ['MISSING', 'VALID', 'INVALID', 'UNKNOWN'] })
  credentialState: string;

  @ApiProperty()
  setupRequired: boolean;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastValidatedAt: string | null;

  @ApiProperty({ type: () => [FishVoiceResponseDto] })
  voices: FishVoiceResponseDto[];
}

export class FishVoiceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'bf322df2096a46f18c579d0baa36f41d' })
  referenceId: string;

  @ApiProperty({ example: 'Sarah' })
  name: string;

  @ApiProperty({ enum: ['DEFAULT', 'CUSTOM'] })
  source: string;

  @ApiProperty({
    description:
      'Whether this voice can be selected for a new generation. Disabled defaults remain visible for history and selection recovery.',
  })
  enabled: boolean;

  @ApiProperty()
  selected: boolean;
}

export class TtsModelsResponseDto {
  @ApiProperty({
    description:
      'The authenticated user’s saved default model for future audio generation',
    example: 'local.kokoro-82m',
    nullable: true,
    type: String,
  })
  selectedModelId: string | null;

  @ApiProperty({ type: () => [FishCredentialResponseDto] })
  providers: [FishCredentialResponseDto];

  @ApiProperty({ type: () => [TtsModelGroupResponseDto] })
  groups: TtsModelGroupResponseDto[];
}

export class TtsModelSelectionResponseDto {
  @ApiProperty({ example: 'local.kokoro-82m' })
  selectedModelId: string;
}
