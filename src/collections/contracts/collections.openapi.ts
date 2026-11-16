import { ApiProperty } from '@nestjs/swagger';
import { BookSummaryResponseDto } from '../../books/contracts/books.openapi.js';

export class CollectionSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ enum: ['PRIVATE', 'PUBLIC'] })
  visibility: string;

  @ApiProperty()
  isOwner: boolean;

  @ApiProperty({ description: 'Whether the viewer saved this collection' })
  isAdded: boolean;

  @ApiProperty({ minimum: 0, description: 'Readable books, excluding ghosts' })
  bookCount: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  coverBookId: string | null;

  @ApiProperty({ description: 'True only when the list request passed bookId' })
  containsBook: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class CollectionListItemResponseDto extends CollectionSummaryResponseDto {
  @ApiProperty({
    type: [String],
    description:
      'Signed cover links of the first books that have a cover (up to 5), in collection order',
  })
  coverUrls: string[];
}

export class CollectionGhostResponseDto {
  @ApiProperty({ format: 'uuid' })
  collectionId: string;

  @ApiProperty()
  title: string;
}

export class CollectionBookEntryResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ minimum: 0 })
  position: number;

  @ApiProperty()
  isGhost: boolean;

  @ApiProperty({ type: () => BookSummaryResponseDto, nullable: true })
  book: BookSummaryResponseDto | null;
}

export class CollectionDetailResponseDto {
  @ApiProperty({ type: () => CollectionSummaryResponseDto })
  collection: CollectionSummaryResponseDto;

  @ApiProperty({ type: () => [CollectionBookEntryResponseDto] })
  books: CollectionBookEntryResponseDto[];
}

export class CollectionsListResponseDto {
  @ApiProperty({ type: () => [CollectionListItemResponseDto] })
  collections: CollectionListItemResponseDto[];

  @ApiProperty({ type: Number, nullable: true, minimum: 0 })
  nextOffset: number | null;
}

export class MyCollectionsListResponseDto extends CollectionsListResponseDto {
  @ApiProperty({
    type: () => [CollectionGhostResponseDto],
    description: 'Saved collections whose owner has made them private',
  })
  ghosts: CollectionGhostResponseDto[];
}
