import { z, ZodSchema } from 'zod';
import { ApiErrorCode } from '@rt/contracts';

export class ValidationError extends Error {
  constructor(
    public code: ApiErrorCode,
    public errors: Array<{ field: string; message: string }>
  ) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

/**
 * Validate data against a Zod schema
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));

      throw new ValidationError(ApiErrorCode.VALIDATION_ERROR, errors);
    }
    throw error;
  }
}

/**
 * Validate data against a Zod schema, returning null if invalid
 */
export function validateSafe<T>(schema: ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Email validation
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Phone validation (international format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
}

/**
 * Password strength validation
 */
export function isStrongPassword(password: string): boolean {
  // At least 8 chars, 1 uppercase, 1 lowercase, 1 number
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

/**
 * Sanitize string (remove HTML tags, trim)
 */
export function sanitizeString(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
}
