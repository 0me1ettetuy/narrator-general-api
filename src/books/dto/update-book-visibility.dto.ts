import { IsIn } from 'class-validator';

export const BOOK_VISIBILITIES = ['PRIVATE', 'PUBLIC'] as const;

export class UpdateBookVisibilityDto {
  @IsIn(BOOK_VISIBILITIES)
  visibility: (typeof BOOK_VISIBILITIES)[number];
}
