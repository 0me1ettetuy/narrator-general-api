export const API_ERROR_CODES = {
  conflict: 'CONFLICT',
  emailAlreadyRegistered: 'EMAIL_ALREADY_REGISTERED',
  forbidden: 'FORBIDDEN',
  internalServerError: 'INTERNAL_SERVER_ERROR',
  invalidCredentials: 'INVALID_CREDENTIALS',
  notFound: 'NOT_FOUND',
  rateLimited: 'RATE_LIMITED',
  ttsModelNotFound: 'TTS_MODEL_NOT_FOUND',
  ttsModelUnavailable: 'TTS_MODEL_UNAVAILABLE',
  unauthorized: 'UNAUTHORIZED',
  unknownError: 'UNKNOWN_ERROR',
  validationFailed: 'VALIDATION_FAILED',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

type ErrorMessage = string | string[];

type ApiErrorResponse = {
  code?: unknown;
  message?: unknown;
};

const apiErrorCodesByStatus: Partial<Record<number, ApiErrorCode>> = {
  400: API_ERROR_CODES.validationFailed,
  401: API_ERROR_CODES.unauthorized,
  403: API_ERROR_CODES.forbidden,
  404: API_ERROR_CODES.notFound,
  409: API_ERROR_CODES.conflict,
  429: API_ERROR_CODES.rateLimited,
  500: API_ERROR_CODES.internalServerError,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorMessage(value: unknown): value is ErrorMessage {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === 'string' &&
    Object.values(API_ERROR_CODES).includes(value as ApiErrorCode)
  );
}

function toApiErrorResponse(value: unknown): ApiErrorResponse | undefined {
  return isRecord(value) ? value : undefined;
}

export function createApiErrorResponse(
  statusCode: number,
  source: unknown,
  fallbackMessage: string,
) {
  const response = toApiErrorResponse(source);
  const message =
    typeof source === 'string'
      ? source
      : response && isErrorMessage(response.message)
        ? response.message
        : fallbackMessage;
  const code = isApiErrorCode(response?.code)
    ? response.code
    : (apiErrorCodesByStatus[statusCode] ?? API_ERROR_CODES.unknownError);

  return {
    statusCode,
    timeStamp: new Date().toISOString(),
    code,
    message: statusCode >= 500 ? 'Internal server error' : message,
  };
}
