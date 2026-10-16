import { IsUUID } from 'class-validator';

export class BookIdParamsDto {
  @IsUUID()
  bookId: string;
}
