import { ApiProperty } from '@nestjs/swagger';

export class SafeUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: SafeUserResponseDto })
  user: SafeUserResponseDto;

  @ApiProperty()
  accessToken: string;
}

export class CsrfResponseDto {
  @ApiProperty()
  csrfToken: string;
}

export class RefreshResponseDto {
  @ApiProperty()
  accessToken: string;
}

export class LogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class MeResponseDto {
  @ApiProperty({ type: SafeUserResponseDto })
  user: SafeUserResponseDto;
}
