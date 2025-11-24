import { Request, Response } from 'express';
import { VATValidationService } from '../services/vat-validation.service.js';
import { validateVATSchema } from '@rt/contracts';

export class VATController {
  private vatValidationService: VATValidationService;

  constructor() {
    this.vatValidationService = new VATValidationService();
  }

  /**
   * POST /vat/validate
   * Validate a VAT number using VIES API
   */
  async validateVAT(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validation = validateVATSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validation.error.errors,
        });
        return;
      }

      const { vatNumber } = validation.data;

      // Validate VAT number
      const result = await this.vatValidationService.validateVATNumber(vatNumber);

      res.status(200).json(result);
    } catch (error) {
      console.error('VAT validation error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: (error as Error).message,
      });
    }
  }

  /**
   * POST /vat/validate-format
   * Validate VAT format without calling VIES API
   */
  validateVATFormat(req: Request, res: Response): void {
    try {
      const validation = validateVATSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Validation error',
          details: validation.error.errors,
        });
        return;
      }

      const { vatNumber } = validation.data;

      const isValid = this.vatValidationService.validateVATFormat(vatNumber);

      res.status(200).json({
        valid: isValid,
        vatNumber,
      });
    } catch (error) {
      console.error('VAT format validation error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: (error as Error).message,
      });
    }
  }
}
