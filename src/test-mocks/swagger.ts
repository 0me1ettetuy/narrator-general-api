const decorator =
  (..._args: unknown[]) =>
  () =>
    undefined;

export const ApiBearerAuth = decorator;
export const ApiBody = decorator;
export const ApiCookieAuth = decorator;
export const ApiCreatedResponse = decorator;
export const ApiOkResponse = decorator;
export const ApiOperation = decorator;
export const ApiProperty = decorator;
export const ApiTags = decorator;
export const ApiUnauthorizedResponse = decorator;
