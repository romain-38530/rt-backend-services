import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { validate } from '@rt/utils';
import { loginSchema, registerSchema } from '@rt/contracts';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * POST /auth/login
   */
  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentials = validate(loginSchema, req.body);
      const result = await this.authService.login(credentials);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /auth/register
   */
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData = validate(registerSchema, req.body);
      const result = await this.authService.register(userData);

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /auth/me
   */
  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        });
      }

      const profile = await this.authService.getProfile(userId);

      res.json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /auth/verify
   */
  verify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated',
          },
        });
      }

      const isValid = await this.authService.verifyUser(userId);

      res.json({
        success: true,
        data: { valid: isValid },
      });
    } catch (error) {
      next(error);
    }
  };
}
