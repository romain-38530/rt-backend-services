import { Router, Request, Response } from 'express';
import { validateRequest } from '@rt/utils';
import {
  sendEmailSchema,
  sendSMSSchema,
  sendPushSchema,
} from '@rt/contracts';
import { NotificationService } from '../services/notification.service.js';
import { createLogger } from '@rt/utils';

const logger = createLogger('notification-routes');

export function createNotificationRoutes(
  notificationService: NotificationService
): Router {
  const router = Router();

  // Send email
  router.post('/email', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(sendEmailSchema, req.body);
      const result = await notificationService.sendEmail(validated);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to send email', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send email',
      });
    }
  });

  // Send SMS
  router.post('/sms', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(sendSMSSchema, req.body);
      const result = await notificationService.sendSMS(validated);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to send SMS', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send SMS',
      });
    }
  });

  // Send push notification
  router.post('/push', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(sendPushSchema, req.body);
      const result = await notificationService.sendPush(validated);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to send push notification', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send push notification',
      });
    }
  });

  // Get user notifications
  router.get('/user/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const notifications = await notificationService.getNotifications(userId);

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error: any) {
      logger.error('Failed to get notifications', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get notifications',
      });
    }
  });

  // Get unread notifications
  router.get('/user/:userId/unread', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const notifications = await notificationService.getUnreadNotifications(
        userId
      );

      res.json({
        success: true,
        data: notifications,
      });
    } catch (error: any) {
      logger.error('Failed to get unread notifications', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get unread notifications',
      });
    }
  });

  // Mark notification as read
  router.patch('/:id/read', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await notificationService.markAsRead(id);

      res.json({
        success,
        message: success
          ? 'Notification marked as read'
          : 'Notification not found',
      });
    } catch (error: any) {
      logger.error('Failed to mark notification as read', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to mark notification as read',
      });
    }
  });

  return router;
}
