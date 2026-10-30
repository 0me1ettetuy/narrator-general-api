const decorator =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Swagger mock ignores decorator arguments.
  (..._args: unknown[]) =>
    () =>
      undefined;

export const ApiBearerAuth = decorator;
export const ApiAcceptedResponse = decorator;
export const ApiBadRequestResponse = decorator;
export const ApiBody = decorator;
export const ApiCookieAuth = decorator;
export const ApiConflictResponse = decorator;
export const ApiCreatedResponse = decorator;
export const ApiNotFoundResponse = decorator;
export const ApiNoContentResponse = decorator;
export const ApiOkResponse = decorator;
export const ApiOperation = decorator;
export const ApiProperty = decorator;
export const ApiPropertyOptional = decorator;
export const ApiQuery = decorator;
export const ApiTags = decorator;
export const ApiUnauthorizedResponse = decorator;
