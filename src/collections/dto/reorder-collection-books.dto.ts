import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export const MAX_BOOKS_PER_COLLECTION = 500;

export class ReorderCollectionBooksDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: MAX_BOOKS_PER_COLLECTION,
    description: 'Every book ID in the collection, once, including ghosts',
  })
  @IsArray()
  @ArrayMaxSize(MAX_BOOKS_PER_COLLECTION)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  bookIds: string[];
}
