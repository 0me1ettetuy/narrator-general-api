import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BOOK_VISIBILITIES } from '../../books/dto/update-book-visibility.dto.js';

export class UpdateCollectionVisibilityDto {
  @ApiProperty({ enum: BOOK_VISIBILITIES })
  @IsIn(BOOK_VISIBILITIES)
  visibility: (typeof BOOK_VISIBILITIES)[number];
}
