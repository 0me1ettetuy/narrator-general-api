import { UnauthorizedException } from '@nestjs/common';
import { API_ERROR_CODES } from '../../global-filters/api-error.js';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super({
      code: API_ERROR_CODES.invalidCredentials,
      message: 'Invalid credentials',
    });
  }
}
