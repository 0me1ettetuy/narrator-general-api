import { ApiProperty } from '@nestjs/swagger';

export class TtsModelResponseDto {
  @ApiProperty({ example: 'local.piper.en-us-amy' })
  id: string;

  @ApiProperty({ example: 'local-piper' })
  provider: string;

  @ApiProperty({ example: 'Piper — English (Amy)' })
  displayName: string;

  @ApiProperty({ enum: ['LOCAL'] })
  source: 'LOCAL';

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
  @ApiProperty({ enum: ['local'] })
  id: 'local';

  @ApiProperty({ example: 'Local models' })
  displayName: 'Local models';

  @ApiProperty({ type: () => [TtsModelResponseDto] })
  models: TtsModelResponseDto[];
}

export class TtsModelsResponseDto {
  @ApiProperty({ type: () => [TtsModelGroupResponseDto] })
  groups: TtsModelGroupResponseDto[];
}
