import { z } from 'zod';

/**
 * Company/Enterprise information schema
 */
export const companySchema = z.object({
  // Basic company info
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  legalName: z.string().optional(),
  registrationNumber: z.string().optional(), // Company registration number (different per country)

  // Tax identification
  vatNumber: z.string().optional(), // EU VAT number (format: FR12345678901)
  vatValidated: z.boolean().optional(), // Whether VAT was validated via VIES
  vatValidatedAt: z.date().optional(),
  vatCompanyName: z.string().optional(), // Company name from VIES
  vatCompanyAddress: z.string().optional(), // Company address from VIES

  // French specific
  siret: z.string().regex(/^\d{14}$/, 'SIRET must be 14 digits').optional(),
  siren: z.string().regex(/^\d{9}$/, 'SIREN must be 9 digits').optional(),

  // Address
  address: z.object({
    street: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    postalCode: z.string(),
    state: z.string().optional(),
    country: z.string().length(2, 'Country must be 2-letter ISO code'),
  }),

  // Contact
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),

  // Business info
  industry: z.string().optional(),
  employeeCount: z.number().int().positive().optional(),
  yearFounded: z.number().int().min(1800).max(new Date().getFullYear()).optional(),

  // Status
  active: z.boolean().default(true),
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  verifiedAt: z.date().optional(),
});

export const createCompanySchema = companySchema;

export const updateCompanySchema = companySchema.partial();

export const validateVATSchema = z.object({
  vatNumber: z.string().min(3, 'VAT number is required'),
  countryCode: z.string().length(2, 'Country code must be 2 letters').optional(),
});

export type Company = z.infer<typeof companySchema>;
export type CreateCompany = z.infer<typeof createCompanySchema>;
export type UpdateCompany = z.infer<typeof updateCompanySchema>;
export type ValidateVAT = z.infer<typeof validateVATSchema>;
