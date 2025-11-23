import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@rt/security';
import { ApiErrorCode } from '@rt/contracts';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    type: string;
  };
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'No token provided',
        },
      });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);
      req.user = decoded;
      next();
    } catch (error: any) {
      if (error.message === 'TOKEN_EXPIRED') {
        res.status(401).json({
          success: false,
          error: {
            code: ApiErrorCode.TOKEN_EXPIRED,
            message: 'Token expired',
          },
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: {
          code: ApiErrorCode.INVALID_TOKEN,
          message: 'Invalid token',
        },
      });
    }
  } catch (error) {
    next(error);
  }
}
