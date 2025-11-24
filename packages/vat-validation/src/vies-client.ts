import fetch from 'node-fetch';
import {
  VATValidationRequest,
  VATValidationResponse,
  VIESResponse,
  VAT_PATTERNS,
  VATCountryCode,
} from './types.js';

export class VIESClient {
  private apiUrl: string;
  private timeout: number;
  private cache: Map<string, { response: VATValidationResponse; timestamp: number }>;
  private cacheTTL: number = 3600000; // 1 hour in milliseconds

  constructor(apiUrl?: string, timeout?: number) {
    this.apiUrl = apiUrl || 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';
    this.timeout = timeout || 5000;
    this.cache = new Map();
  }

  /**
   * Validate VAT number format
   */
  public validateFormat(countryCode: string, vatNumber: string): boolean {
    const pattern = VAT_PATTERNS[countryCode];
    if (!pattern) {
      return false;
    }

    // Remove spaces and special characters
    const cleanVatNumber = vatNumber.replace(/[\s.-]/g, '');
    return pattern.test(cleanVatNumber);
  }

  /**
   * Parse full VAT number (e.g., "FR12345678901") into country code and number
   */
  public parseVATNumber(fullVatNumber: string): { countryCode: string; vatNumber: string } | null {
    const cleaned = fullVatNumber.replace(/[\s.-]/g, '').toUpperCase();

    // Extract country code (first 2 characters)
    const countryCode = cleaned.substring(0, 2);
    const vatNumber = cleaned.substring(2);

    if (!Object.values(VATCountryCode).includes(countryCode as VATCountryCode)) {
      return null;
    }

    return { countryCode, vatNumber };
  }

  /**
   * Validate VAT number using VIES API
   */
  public async validate(request: VATValidationRequest): Promise<VATValidationResponse> {
    const { countryCode, vatNumber } = request;

    // Check format first
    if (!this.validateFormat(countryCode, vatNumber)) {
      return {
        valid: false,
        countryCode,
        vatNumber,
        requestDate: new Date().toISOString(),
        errorCode: 'INVALID_FORMAT',
        errorMessage: `Invalid VAT number format for country ${countryCode}`,
      };
    }

    // Check cache
    const cacheKey = `${countryCode}:${vatNumber}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.response;
    }

    // Clean VAT number
    const cleanVatNumber = vatNumber.replace(/[\s.-]/g, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.apiUrl}/${countryCode}/${cleanVatNumber}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          const result: VATValidationResponse = {
            valid: false,
            countryCode,
            vatNumber: cleanVatNumber,
            requestDate: new Date().toISOString(),
            errorCode: 'NOT_FOUND',
            errorMessage: 'VAT number not found in VIES database',
          };
          this.cache.set(cacheKey, { response: result, timestamp: Date.now() });
          return result;
        }

        throw new Error(`VIES API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as VIESResponse;

      const result: VATValidationResponse = {
        valid: data.valid === true,
        countryCode: data.originalRequest?.countryCode || countryCode,
        vatNumber: data.originalRequest?.vatNumber || cleanVatNumber,
        requestDate: data.requestDate || new Date().toISOString(),
        name: data.traderName || data.name,
        address: this.formatAddress(data),
      };

      // Cache the result
      this.cache.set(cacheKey, { response: result, timestamp: Date.now() });

      return result;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          valid: false,
          countryCode,
          vatNumber: cleanVatNumber,
          requestDate: new Date().toISOString(),
          errorCode: 'TIMEOUT',
          errorMessage: 'VIES API request timeout',
        };
      }

      return {
        valid: false,
        countryCode,
        vatNumber: cleanVatNumber,
        requestDate: new Date().toISOString(),
        errorCode: 'API_ERROR',
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Format address from VIES response
   */
  private formatAddress(data: VIESResponse): string {
    if (data.traderAddress) {
      return data.traderAddress;
    }

    if (data.address) {
      return data.address;
    }

    const parts = [
      data.traderStreet,
      data.traderPostcode,
      data.traderCity,
      data.traderCountryCode,
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  public getCacheSize(): number {
    return this.cache.size;
  }
}
