import { z } from 'zod';
import { UserType } from '../enums/index.js';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  phone: z.string().optional(),
  type: z.nativeEnum(UserType),
  companyId: z.string().optional(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phone: z.string().optional(),
  avatar: z.string().url().optional(),
  preferences: z
    .object({
      language: z.string(),
      timezone: z.string(),
      notifications: z.object({
        email: z.boolean(),
        sms: z.boolean(),
        push: z.boolean(),
      }),
    })
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
});

export const confirmResetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
});
export const registerWithCompanySchema = registerSchema.extend({
  company: z.object({
    name: z.string().min(2, 'Company name must be at least 2 characters'),
    vatNumber: z.string().optional(),
    siret: z.string().regex(/^\d{14}$/, 'SIRET must be 14 digits').optional(),
    siren: z.string().regex(/^\d{9}$/, 'SIREN must be 9 digits').optional(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      postalCode: z.string(),
      country: z.string().length(2, 'Country must be 2-letter ISO code'),
    }),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }).optional(),
});
