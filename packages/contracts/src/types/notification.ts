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
