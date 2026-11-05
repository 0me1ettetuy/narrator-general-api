import { IsUUID } from 'class-validator';

export class CollectionIdParamsDto {
  @IsUUID()
  collectionId: string;
}
