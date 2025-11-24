import { subscriptionRepository } from '../repositories/index.js';
import {
  SubscriptionPlan,
  Subscription,
  Invoice,
  Payment,
  Usage,
  SubscriptionStatus,
  BillingInterval,
  InvoiceStatus,
  PaymentStatus,
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  CreatePaymentInput,
  UpdateUsageInput,
} from '@rt/contracts';

export class SubscriptionService {
  // Subscription Plans
  async createPlan(input: CreateSubscriptionPlanInput): Promise<SubscriptionPlan> {
    return await subscriptionRepository.createPlan(input);
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | null> {
    return await subscriptionRepository.getPlanById(id);
  }

  async getAllPlans(activeOnly = true): Promise<SubscriptionPlan[]> {
    return await subscriptionRepository.getAllPlans(activeOnly);
  }

  async updatePlan(id: string, input: UpdateSubscriptionPlanInput): Promise<SubscriptionPlan> {
    const plan = await subscriptionRepository.updatePlan(id, input);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }
    return plan;
  }

  async deactivatePlan(id: string): Promise<boolean> {
    // Check if any active subscriptions use this plan
    const subscriptions = await subscriptionRepository.getExpiringSubscriptions(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    const hasActiveSubscriptions = subscriptions.some(sub => sub.planId === id);

    if (hasActiveSubscriptions) {
      throw new Error('Cannot deactivate plan with active subscriptions');
    }

    return await subscriptionRepository.deactivatePlan(id);
  }

  // Subscriptions
  async createSubscription(input: CreateSubscriptionInput): Promise<Subscription> {
    // Check if user already has an active subscription
    const existing = await subscriptionRepository.getActiveSubscriptionByUserId(input.userId);
    if (existing) {
      throw new Error('User already has an active subscription');
    }

    // Get plan to calculate dates
    const plan = await subscriptionRepository.getPlanById(input.planId);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const now = new Date();
    let status = SubscriptionStatus.ACTIVE;
    let trialStart: Date | undefined;
    let trialEnd: Date | undefined;

    // Handle trial period
    if (input.startTrial && plan.trialDays > 0) {
      status = SubscriptionStatus.TRIALING;
      trialStart = now;
      trialEnd = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
    }

    // Calculate billing period
    const currentPeriodStart = now;
    const currentPeriodEnd = this.calculatePeriodEnd(now, input.billingInterval);

    const subscription = await subscriptionRepository.createSubscription({
      userId: input.userId,
      companyId: input.companyId,
      planId: input.planId,
      status,
      billingInterval: input.billingInterval,
      currentPeriodStart,
      currentPeriodEnd,
      trialStart,
      trialEnd,
      metadata: input.metadata,
    });

    // Create initial usage record
    await subscriptionRepository.createUsage({
      subscriptionId: subscription.id,
      userId: input.userId,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      metrics: {
        users: 0,
        vehicles: 0,
        orders: 0,
        storage: 0,
        apiCalls: 0,
      },
    });

    return subscription;
  }

  async getSubscriptionById(id: string): Promise<Subscription | null> {
    return await subscriptionRepository.getSubscriptionById(id);
  }

  async getActiveSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    return await subscriptionRepository.getActiveSubscriptionByUserId(userId);
  }

  async updateSubscription(id: string, input: UpdateSubscriptionInput): Promise<Subscription> {
    const subscription = await subscriptionRepository.getSubscriptionById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // If changing plan, validate it exists
    if (input.planId && input.planId !== subscription.planId) {
      const newPlan = await subscriptionRepository.getPlanById(input.planId);
      if (!newPlan) {
        throw new Error('New subscription plan not found');
      }
    }

    const updated = await subscriptionRepository.updateSubscription(id, input);
    if (!updated) {
      throw new Error('Failed to update subscription');
    }

    return updated;
  }

  async cancelSubscription(id: string, cancelAt?: Date): Promise<Subscription> {
    const subscription = await subscriptionRepository.getSubscriptionById(id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new Error('Subscription is already cancelled');
    }

    const updates: UpdateSubscriptionInput = {
      cancelAt: cancelAt || subscription.currentPeriodEnd,
    };

    // If cancelling immediately, update status
    if (!cancelAt || cancelAt <= new Date()) {
      updates.status = SubscriptionStatus.CANCELLED;
      updates.cancelledAt = new Date();
    }

    const updated = await subscriptionRepository.updateSubscription(id, updates);
    if (!updated) {
      throw new Error('Failed to cancel subscription');
    }

    return updated;
  }

  async renewSubscription(subscriptionId: string): Promise<Subscription> {
    const subscription = await subscriptionRepository.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const plan = await subscriptionRepository.getPlanById(subscription.planId);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Calculate new billing period
    const currentPeriodStart = subscription.currentPeriodEnd;
    const currentPeriodEnd = this.calculatePeriodEnd(currentPeriodStart, subscription.billingInterval);

    // Update subscription
    const updated = await subscriptionRepository.updateSubscription(subscriptionId, {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart,
      currentPeriodEnd,
    });

    if (!updated) {
      throw new Error('Failed to renew subscription');
    }

    // Create invoice for renewal
    const amount = subscription.billingInterval === BillingInterval.YEARLY
      ? plan.priceYearly
      : subscription.billingInterval === BillingInterval.QUARTERLY
        ? plan.priceMonthly * 3
        : plan.priceMonthly;

    await this.createInvoice({
      subscriptionId: updated.id,
      userId: updated.userId,
      companyId: updated.companyId,
      items: [{
        description: `${plan.name} - ${subscription.billingInterval}`,
        quantity: 1,
        unitPrice: amount,
        total: amount,
      }],
      tax: amount * 0.2, // 20% VAT
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return updated;
  }

  // Invoices
  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const subtotal = input.items.reduce((sum, item) => sum + item.total, 0);
    const total = subtotal + input.tax;

    return await subscriptionRepository.createInvoice({
      ...input,
      subtotal,
      total,
      status: InvoiceStatus.PENDING,
      currency: 'EUR',
    });
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    return await subscriptionRepository.getInvoiceById(id);
  }

  async getInvoicesBySubscriptionId(subscriptionId: string): Promise<Invoice[]> {
    return await subscriptionRepository.getInvoicesBySubscriptionId(subscriptionId);
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    return await subscriptionRepository.getInvoicesByUserId(userId);
  }

  async updateInvoice(id: string, input: UpdateInvoiceInput): Promise<Invoice> {
    const invoice = await subscriptionRepository.updateInvoice(id, input);
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    return invoice;
  }

  async markInvoicePaid(id: string, paymentInput: CreatePaymentInput): Promise<Invoice> {
    const invoice = await subscriptionRepository.getInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new Error('Invoice is already paid');
    }

    // Create payment record
    await this.createPayment(paymentInput);

    // Update invoice
    const updated = await subscriptionRepository.updateInvoice(id, {
      status: InvoiceStatus.PAID,
      paidAt: new Date(),
      paymentMethod: paymentInput.method,
    });

    if (!updated) {
      throw new Error('Failed to update invoice');
    }

    return updated;
  }

  // Payments
  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    return await subscriptionRepository.createPayment({
      ...input,
      userId: '', // Will be populated from invoice
      status: PaymentStatus.COMPLETED,
      processedAt: new Date(),
    });
  }

  async getPaymentsByInvoiceId(invoiceId: string): Promise<Payment[]> {
    return await subscriptionRepository.getPaymentsByInvoiceId(invoiceId);
  }

  // Usage Tracking
  async updateUsage(input: UpdateUsageInput): Promise<Usage> {
    const usage = await subscriptionRepository.updateUsage(input.subscriptionId, input.metrics);
    if (!usage) {
      throw new Error('Failed to update usage');
    }
    return usage;
  }

  async getCurrentUsage(subscriptionId: string): Promise<Usage | null> {
    return await subscriptionRepository.getCurrentUsage(subscriptionId);
  }

  async checkUsageLimits(subscriptionId: string): Promise<{
    withinLimits: boolean;
    exceeded: string[];
  }> {
    const subscription = await subscriptionRepository.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const plan = await subscriptionRepository.getPlanById(subscription.planId);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const usage = await subscriptionRepository.getCurrentUsage(subscriptionId);
    if (!usage) {
      return { withinLimits: true, exceeded: [] };
    }

    const exceeded: string[] = [];

    if (usage.metrics.users > plan.limits.maxUsers) {
      exceeded.push('users');
    }
    if (usage.metrics.vehicles > plan.limits.maxVehicles) {
      exceeded.push('vehicles');
    }
    if (usage.metrics.orders > plan.limits.maxOrders) {
      exceeded.push('orders');
    }
    if (usage.metrics.storage > plan.limits.maxStorage) {
      exceeded.push('storage');
    }
    if (usage.metrics.apiCalls > plan.limits.apiCallsPerDay) {
      exceeded.push('apiCalls');
    }

    return {
      withinLimits: exceeded.length === 0,
      exceeded,
    };
  }

  // Helper methods
  private calculatePeriodEnd(startDate: Date, interval: BillingInterval): Date {
    const end = new Date(startDate);

    switch (interval) {
      case BillingInterval.MONTHLY:
        end.setMonth(end.getMonth() + 1);
        break;
      case BillingInterval.QUARTERLY:
        end.setMonth(end.getMonth() + 3);
        break;
      case BillingInterval.YEARLY:
        end.setFullYear(end.getFullYear() + 1);
        break;
    }

    return end;
  }
}

export const subscriptionService = new SubscriptionService();
