import { Request, Response, NextFunction } from 'express';
import { ApiErrorCode } from '@rt/contracts';
import { logger } from '../utils/logger.js';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: {
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      message: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
    },
    timestamp: new Date().toISOString(),
  });
}
