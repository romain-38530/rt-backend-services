import { Request, Response, NextFunction } from 'express';
import { type ZodError } from 'zod';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: Error | ApiError | any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Zod validation errors
  if (err?.name === 'ZodError') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.errors.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // API errors with status code
  if ('statusCode' in err && err.statusCode) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: 'code' in err ? err.code : 'ERROR',
        message: err.message,
      },
    });
    return;
  }

  // MongoDB duplicate key error
  if ('code' in err && err.code === 11000) {
    res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: 'Resource already exists',
      },
    });
    return;
  }

  // Default error
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    },
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};
