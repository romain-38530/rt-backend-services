import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/index.js';
import {
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  createInvoiceSchema,
  updateInvoiceSchema,
  createPaymentSchema,
  updateUsageSchema,
} from '@rt/contracts';

export class SubscriptionController {
  // Subscription Plans
  async createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSubscriptionPlanSchema.parse(req.body);
      const plan = await subscriptionService.createPlan(input);
      res.status(201).json({ success: true, data: plan });
    } catch (error) {
      next(error);
    }
  }

  async getAllPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const plans = await subscriptionService.getAllPlans(activeOnly);
      res.json({ success: true, data: plans });
    } catch (error) {
      next(error);
    }
  }

  async getPlanById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const plan = await subscriptionService.getPlanById(id);

      if (!plan) {
        res.status(404).json({ success: false, error: 'Subscription plan not found' });
        return;
      }

      res.json({ success: true, data: plan });
    } catch (error) {
      next(error);
    }
  }

  async updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateSubscriptionPlanSchema.parse(req.body);
      const plan = await subscriptionService.updatePlan(id, input);
      res.json({ success: true, data: plan });
    } catch (error) {
      next(error);
    }
  }

  async deactivatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await subscriptionService.deactivatePlan(id);
      res.json({ success: true, message: 'Plan deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Subscriptions
  async createSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionService.createSubscription(input);
      res.status(201).json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async getSubscriptionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = await subscriptionService.getSubscriptionById(id);

      if (!subscription) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async getActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const subscription = await subscriptionService.getActiveSubscriptionByUserId(userId);

      if (!subscription) {
        res.status(404).json({ success: false, error: 'No active subscription found' });
        return;
      }

      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async updateSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateSubscriptionSchema.parse(req.body);
      const subscription = await subscriptionService.updateSubscription(id, input);
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { cancelAt } = req.body;
      const subscription = await subscriptionService.cancelSubscription(
        id,
        cancelAt ? new Date(cancelAt) : undefined
      );
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  async renewSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const subscription = await subscriptionService.renewSubscription(id);
      res.json({ success: true, data: subscription });
    } catch (error) {
      next(error);
    }
  }

  // Invoices
  async createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = createInvoiceSchema.parse(req.body);
      const invoice = await subscriptionService.createInvoice(input);
      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const invoice = await subscriptionService.getInvoiceById(id);

      if (!invoice) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      res.json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async getInvoicesBySubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = req.params;
      const invoices = await subscriptionService.getInvoicesBySubscriptionId(subscriptionId);
      res.json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  }

  async getInvoicesByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const invoices = await subscriptionService.getInvoicesByUserId(userId);
      res.json({ success: true, data: invoices });
    } catch (error) {
      next(error);
    }
  }

  async updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const input = updateInvoiceSchema.parse(req.body);
      const invoice = await subscriptionService.updateInvoice(id, input);
      res.json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async markInvoicePaid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const paymentInput = createPaymentSchema.parse(req.body);
      const invoice = await subscriptionService.markInvoicePaid(id, paymentInput);
      res.json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  // Payments
  async getPaymentsByInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { invoiceId } = req.params;
      const payments = await subscriptionService.getPaymentsByInvoiceId(invoiceId);
      res.json({ success: true, data: payments });
    } catch (error) {
      next(error);
    }
  }

  // Usage Tracking
  async updateUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = updateUsageSchema.parse(req.body);
      const usage = await subscriptionService.updateUsage(input);
      res.json({ success: true, data: usage });
    } catch (error) {
      next(error);
    }
  }

  async getCurrentUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = req.params;
      const usage = await subscriptionService.getCurrentUsage(subscriptionId);

      if (!usage) {
        res.status(404).json({ success: false, error: 'Usage data not found' });
        return;
      }

      res.json({ success: true, data: usage });
    } catch (error) {
      next(error);
    }
  }

  async checkUsageLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { subscriptionId } = req.params;
      const result = await subscriptionService.checkUsageLimits(subscriptionId);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const subscriptionController = new SubscriptionController();
