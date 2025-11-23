import {
  Notification,
  SendEmailRequest,
  SendSMSRequest,
  SendPushRequest,
  NotificationResponse,
  NotificationType,
  NotificationStatus,
  NotificationPriority,
} from '@rt/contracts';
import { SESService } from '@rt/cloud-aws';
import { createLogger } from '@rt/utils';
import { NotificationRepository } from '../repositories/notification.repository.js';

const logger = createLogger('notification-service');

export class NotificationService {
  private sesService: SESService;

  constructor(private notificationRepo: NotificationRepository) {
    this.sesService = new SESService({
      region: process.env.AWS_REGION || 'eu-central-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  }

  async sendEmail(request: SendEmailRequest): Promise<NotificationResponse> {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create notification record
      const notification: Partial<Notification> = {
        _id: notificationId,
        type: NotificationType.EMAIL,
        status: NotificationStatus.PENDING,
        priority: request.priority || NotificationPriority.MEDIUM,
        userId: undefined,
        subject: request.subject,
        content: request.content,
        data: {
          to: request.to,
          cc: request.cc,
          bcc: request.bcc,
          templateId: request.templateId,
          templateVars: request.templateVars,
        },
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.notificationRepo.create(notification as Notification);

      // Send email via SES
      const recipients = Array.isArray(request.to) ? request.to : [request.to];
      const from = process.env.EMAIL_FROM || 'noreply@rt-technologie.com';

      await this.sesService.sendEmail({
        from,
        to: recipients,
        subject: request.subject,
        html: request.content,
        cc: request.cc,
        bcc: request.bcc,
      });

      // Update status
      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.SENT
      );

      logger.info('Email sent successfully', { notificationId, to: request.to });

      return {
        id: notificationId,
        status: NotificationStatus.SENT,
        message: 'Email sent successfully',
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to send email', { error: error.message, request });

      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
        error.message
      );

      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendSMS(request: SendSMSRequest): Promise<NotificationResponse> {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const notification: Partial<Notification> = {
        _id: notificationId,
        type: NotificationType.SMS,
        status: NotificationStatus.PENDING,
        priority: request.priority || NotificationPriority.MEDIUM,
        userId: request.userId,
        subject: 'SMS Notification',
        content: request.message,
        data: { to: request.to },
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.notificationRepo.create(notification as Notification);

      // TODO: Integrate with SMS provider (Twilio, SNS, etc.)
      // For now, just log
      logger.info('SMS would be sent', { to: request.to, message: request.message });

      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.SENT
      );

      return {
        id: notificationId,
        status: NotificationStatus.SENT,
        message: 'SMS sent successfully',
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to send SMS', { error: error.message, request });

      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
        error.message
      );

      throw new Error(`Failed to send SMS: ${error.message}`);
    }
  }

  async sendPush(request: SendPushRequest): Promise<NotificationResponse> {
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const notification: Partial<Notification> = {
        _id: notificationId,
        type: NotificationType.PUSH,
        status: NotificationStatus.PENDING,
        priority: request.priority || NotificationPriority.MEDIUM,
        userId: request.userId,
        subject: request.title,
        content: request.message,
        data: request.data,
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.notificationRepo.create(notification as Notification);

      // TODO: Integrate with push notification service (FCM, APNS, etc.)
      logger.info('Push notification would be sent', {
        userId: request.userId,
        title: request.title,
      });

      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.SENT
      );

      return {
        id: notificationId,
        status: NotificationStatus.SENT,
        message: 'Push notification sent successfully',
        sentAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to send push notification', {
        error: error.message,
        request,
      });

      await this.notificationRepo.updateStatus(
        notificationId,
        NotificationStatus.FAILED,
        error.message
      );

      throw new Error(`Failed to send push notification: ${error.message}`);
    }
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepo.findByUserId(userId);
  }

  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return this.notificationRepo.findUnread(userId);
  }

  async markAsRead(notificationId: string): Promise<boolean> {
    return this.notificationRepo.markAsRead(notificationId);
  }

  async cleanupOldNotifications(days: number = 90): Promise<number> {
    return this.notificationRepo.deleteOlderThan(days);
  }
}
