import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SelectFishVoiceDto {
  @ApiProperty({
    description:
      'ID of an enabled shared default voice or one of the authenticated user’s custom Fish voices.',
    format: 'uuid',
  })
  @IsUUID()
  id: string;
}
