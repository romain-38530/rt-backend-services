import { BaseEntity } from './common.js';
import {
  NotificationType,
  NotificationStatus,
  NotificationPriority,
} from '../enums/index.js';

export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  status: NotificationStatus;
  priority: NotificationPriority;
  subject: string;
  content: string;
  data?: Record<string, any>;
  sentAt?: Date;
  readAt?: Date;
  errorMessage?: string;
  retryCount: number;
}

export interface SendNotificationRequest {
  userId: string | string[];
  type: NotificationType;
  priority?: NotificationPriority;
  subject: string;
  content: string;
  data?: Record<string, any>;
  scheduledFor?: Date;
}

export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  content: string; // HTML content
  cc?: string[];
  bcc?: string[];
  templateId?: string;
  templateVars?: Record<string, any>;
  attachments?: EmailAttachment[];
  priority?: NotificationPriority;
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendSMSRequest {
  to: string; // Phone number
  message: string;
  userId?: string;
  priority?: NotificationPriority;
}

export interface SendPushRequest {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
  priority?: NotificationPriority;
}

export interface NotificationResponse {
  id: string;
  status: NotificationStatus;
  message: string;
  sentAt?: Date;
}
