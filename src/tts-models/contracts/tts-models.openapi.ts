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
}

export class TtsModelsResponseDto {
  @ApiProperty({ type: () => [FishCredentialResponseDto] })
  providers: [FishCredentialResponseDto];

  @ApiProperty({ type: () => [TtsModelGroupResponseDto] })
  groups: TtsModelGroupResponseDto[];
}
