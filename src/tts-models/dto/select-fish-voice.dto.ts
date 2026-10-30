import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SelectFishVoiceDto {
  @ApiProperty({
    description: 'ID of one of the authenticated user’s saved Fish voices.',
    format: 'uuid',
  })
  @IsUUID()
  id: string;
}
