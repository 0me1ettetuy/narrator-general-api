import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AddCollectionBookDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookId: string;

  @ApiPropertyOptional({
    description:
      'Confirms making a private book public for a public collection',
  })
  @IsOptional()
  @IsBoolean()
  makePublic?: boolean;
}
