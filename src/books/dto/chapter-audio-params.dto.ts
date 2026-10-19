import { IsUUID } from 'class-validator';

export class ChapterAudioParamsDto {
  @IsUUID()
  bookId: string;

  @IsUUID()
  chapterId: string;
}
