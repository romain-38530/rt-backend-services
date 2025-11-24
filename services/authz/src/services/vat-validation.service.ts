import { VIESClient, VATValidationResponse } from '@rt/vat-validation';
import { VATValidationResult } from '@rt/contracts';

export class VATValidationService {
  private viesClient: VIESClient;

  constructor() {
    const vatApiUrl = process.env.VAT_API_URL;
    const vatApiTimeout = parseInt(process.env.VAT_API_TIMEOUT || '5000', 10);
    this.viesClient = new VIESClient(vatApiUrl, vatApiTimeout);
  }

  /**
   * Validate VAT number with VIES API
   */
  async validateVATNumber(vatNumber: string): Promise<VATValidationResult> {
    try {
      // Parse the VAT number to extract country code
      const parsed = this.viesClient.parseVATNumber(vatNumber);

      if (!parsed) {
        return {
          valid: false,
          validatedAt: new Date(),
          errorMessage: 'Invalid VAT number format',
        };
      }

      // Validate with VIES API
      const result: VATValidationResponse = await this.viesClient.validate({
        countryCode: parsed.countryCode,
        vatNumber: parsed.vatNumber,
      });

      return {
        valid: result.valid,
        companyName: result.name,
        companyAddress: result.address,
        validatedAt: new Date(result.requestDate),
        errorMessage: result.errorMessage,
      };
    } catch (error) {
      console.error('VAT validation error:', error);
      return {
        valid: false,
        validatedAt: new Date(),
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Validate VAT format without calling VIES API
   */
  validateVATFormat(vatNumber: string): boolean {
    const parsed = this.viesClient.parseVATNumber(vatNumber);
    if (!parsed) {
      return false;
    }

    return this.viesClient.validateFormat(parsed.countryCode, parsed.vatNumber);
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.viesClient.clearCache();
  }
}
