import { IsUUID } from 'class-validator';

export class CollectionBookParamsDto {
  @IsUUID()
  collectionId: string;

  @IsUUID()
  bookId: string;
}
