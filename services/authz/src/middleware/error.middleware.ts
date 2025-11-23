import { Request, Response, NextFunction } from 'express';
import { ApiErrorCode } from '@rt/contracts';
import { ValidationError, logger } from '@rt/utils';

export function errorMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // Validation error
  if (error instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.errors,
      },
    });
    return;
  }

  // Custom API error
  if (error.code && Object.values(ApiErrorCode).includes(error.code)) {
    const statusCode = getStatusCode(error.code);
    res.status(statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
        details: error.details,
      },
    });
    return;
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: {
      code: ApiErrorCode.INTERNAL_ERROR,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error.message,
    },
  });
}

function getStatusCode(code: ApiErrorCode): number {
  const statusMap: Record<string, number> = {
    [ApiErrorCode.UNAUTHORIZED]: 401,
    [ApiErrorCode.FORBIDDEN]: 403,
    [ApiErrorCode.TOKEN_EXPIRED]: 401,
    [ApiErrorCode.INVALID_TOKEN]: 401,
    [ApiErrorCode.INVALID_CREDENTIALS]: 401,
    [ApiErrorCode.VALIDATION_ERROR]: 400,
    [ApiErrorCode.INVALID_INPUT]: 400,
    [ApiErrorCode.MISSING_FIELD]: 400,
    [ApiErrorCode.NOT_FOUND]: 404,
    [ApiErrorCode.ALREADY_EXISTS]: 409,
    [ApiErrorCode.CONFLICT]: 409,
    [ApiErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
    [ApiErrorCode.OPERATION_NOT_ALLOWED]: 403,
    [ApiErrorCode.QUOTA_EXCEEDED]: 429,
    [ApiErrorCode.SERVICE_UNAVAILABLE]: 503,
    [ApiErrorCode.DATABASE_ERROR]: 500,
    [ApiErrorCode.INTERNAL_ERROR]: 500,
  };

  return statusMap[code] || 500;
}
