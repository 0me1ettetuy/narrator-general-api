import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { API_ERROR_CODES } from './api-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const forbiddenStatus = 403;
  const internalServerErrorStatus = 500;
  const response = {};
  const calls: Array<[unknown, unknown, number]> = [];
  const reply = (...args: [unknown, unknown, number]) => {
    calls.push(args);
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as ArgumentsHost;
  const filter = new AllExceptionsFilter({
    httpAdapter: { reply },
  } as HttpAdapterHost);

  beforeEach(() => {
    calls.length = 0;
  });

  it('preserves the status of middleware HTTP errors', () => {
    const error = Object.assign(new Error('invalid csrf token'), {
      statusCode: forbiddenStatus,
    });

    filter.catch(error, host);

    expect(calls).toContainEqual([
      response,
      expect.objectContaining({
        statusCode: forbiddenStatus,
        code: API_ERROR_CODES.forbidden,
        message: 'invalid csrf token',
      }),
      forbiddenStatus,
    ]);
  });

  it('does not expose unexpected error messages', () => {
    filter.catch(new Error('database password leaked'), host);

    expect(calls).toContainEqual([
      response,
      expect.objectContaining({
        statusCode: internalServerErrorStatus,
        code: API_ERROR_CODES.internalServerError,
        message: 'Internal server error',
      }),
      internalServerErrorStatus,
    ]);
  });
});
