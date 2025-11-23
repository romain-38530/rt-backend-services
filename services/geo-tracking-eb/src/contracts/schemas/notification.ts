import { z } from 'zod';
import {
  NotificationType,
  NotificationStatus,
  NotificationPriority,
} from '../enums/index.js';

export const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  templateId: z.string().optional(),
  templateVars: z.record(z.any()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.union([z.string(), z.instanceof(Buffer)]),
        contentType: z.string().optional(),
      })
    )
    .optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
});

export const sendSMSSchema = z.object({
  to: z.string().min(10).max(20), // Phone number
  message: z.string().min(1).max(1600),
  userId: z.string().optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
});

export const sendPushSchema = z.object({
  userId: z.string(),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  data: z.record(z.any()).optional(),
  badge: z.number().int().min(0).optional(),
  sound: z.string().optional(),
  priority: z.nativeEnum(NotificationPriority).optional(),
});

export const sendNotificationSchema = z.object({
  userId: z.union([z.string(), z.array(z.string())]),
  type: z.nativeEnum(NotificationType),
  priority: z.nativeEnum(NotificationPriority).optional(),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  data: z.record(z.any()).optional(),
  scheduledFor: z.coerce.date().optional(),
});

export type SendEmailInput = z.infer<typeof sendEmailSchema>;
export type SendSMSInput = z.infer<typeof sendSMSSchema>;
export type SendPushInput = z.infer<typeof sendPushSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
