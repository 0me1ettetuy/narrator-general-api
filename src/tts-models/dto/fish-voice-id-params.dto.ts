import { IsUUID } from 'class-validator';

export class FishVoiceIdParamsDto {
  @IsUUID()
  voiceId: string;
}
