import { Collection, ObjectId } from 'mongodb';
import { getDatabase } from '@rt/data-mongo';
import {
  SubscriptionPlan,
  Subscription,
  Invoice,
  Payment,
  Usage,
  SubscriptionStatus,
  InvoiceStatus,
} from '@rt/contracts';

export class SubscriptionRepository {
  private db = getDatabase();

  // Subscription Plans
  async createPlan(plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<SubscriptionPlan> {
    const collection = this.db.collection<SubscriptionPlan>('subscription_plans');
    const now = new Date();
    const doc = {
      ...plan,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | null> {
    const collection = this.db.collection<SubscriptionPlan>('subscription_plans');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getAllPlans(activeOnly = true): Promise<SubscriptionPlan[]> {
    const collection = this.db.collection<SubscriptionPlan>('subscription_plans');
    const query = activeOnly ? { isActive: true } : {};
    const docs = await collection.find(query).sort({ priceMonthly: 1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async updatePlan(id: string, updates: Partial<SubscriptionPlan>): Promise<SubscriptionPlan | null> {
    const collection = this.db.collection<SubscriptionPlan>('subscription_plans');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async deactivatePlan(id: string): Promise<boolean> {
    const collection = this.db.collection<SubscriptionPlan>('subscription_plans');
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: false, updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  // Subscriptions
  async createSubscription(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const now = new Date();
    const doc = {
      ...subscription,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getSubscriptionById(id: string): Promise<Subscription | null> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getActiveSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const doc = await collection.findOne({
      userId,
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
    });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getSubscriptionsByUserId(userId: string): Promise<Subscription[]> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const docs = await collection.find({ userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getSubscriptionsByCompanyId(companyId: string): Promise<Subscription[]> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const docs = await collection.find({ companyId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async updateSubscription(id: string, updates: Partial<Subscription>): Promise<Subscription | null> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getExpiringSubscriptions(beforeDate: Date): Promise<Subscription[]> {
    const collection = this.db.collection<Subscription>('subscriptions');
    const docs = await collection.find({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: { $lte: beforeDate },
    }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Invoices
  async createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Promise<Invoice> {
    const collection = this.db.collection<Invoice>('invoices');
    const now = new Date();

    // Generate invoice number
    const count = await collection.countDocuments();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, '0')}`;

    const doc = {
      ...invoice,
      invoiceNumber,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getInvoiceById(id: string): Promise<Invoice | null> {
    const collection = this.db.collection<Invoice>('invoices');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | null> {
    const collection = this.db.collection<Invoice>('invoices');
    const doc = await collection.findOne({ invoiceNumber });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getInvoicesBySubscriptionId(subscriptionId: string): Promise<Invoice[]> {
    const collection = this.db.collection<Invoice>('invoices');
    const docs = await collection.find({ subscriptionId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    const collection = this.db.collection<Invoice>('invoices');
    const docs = await collection.find({ userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<Invoice | null> {
    const collection = this.db.collection<Invoice>('invoices');
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getOverdueInvoices(): Promise<Invoice[]> {
    const collection = this.db.collection<Invoice>('invoices');
    const now = new Date();
    const docs = await collection.find({
      status: InvoiceStatus.PENDING,
      dueDate: { $lt: now },
    }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Payments
  async createPayment(payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment> {
    const collection = this.db.collection<Payment>('payments');
    const now = new Date();
    const doc = {
      ...payment,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getPaymentById(id: string): Promise<Payment | null> {
    const collection = this.db.collection<Payment>('payments');
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async getPaymentsByInvoiceId(invoiceId: string): Promise<Payment[]> {
    const collection = this.db.collection<Payment>('payments');
    const docs = await collection.find({ invoiceId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  async getPaymentsByUserId(userId: string): Promise<Payment[]> {
    const collection = this.db.collection<Payment>('payments');
    const docs = await collection.find({ userId }).sort({ createdAt: -1 }).toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }

  // Usage Tracking
  async createUsage(usage: Omit<Usage, 'id' | 'createdAt' | 'updatedAt'>): Promise<Usage> {
    const collection = this.db.collection<Usage>('usage');
    const now = new Date();
    const doc = {
      ...usage,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(doc as any);
    return { ...doc, id: result.insertedId.toString() };
  }

  async getCurrentUsage(subscriptionId: string): Promise<Usage | null> {
    const collection = this.db.collection<Usage>('usage');
    const doc = await collection.findOne(
      { subscriptionId },
      { sort: { createdAt: -1 } }
    );
    if (!doc) return null;
    return { ...doc, id: doc._id.toString() };
  }

  async updateUsage(subscriptionId: string, metrics: Usage['metrics']): Promise<Usage | null> {
    const collection = this.db.collection<Usage>('usage');

    // Get current usage
    const current = await this.getCurrentUsage(subscriptionId);

    if (!current) {
      // Create new usage record
      return this.createUsage({
        subscriptionId,
        userId: '', // Will be set by service layer
        periodStart: new Date(),
        periodEnd: new Date(),
        metrics,
      });
    }

    // Update existing usage
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(current.id) },
      { $set: { metrics, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    return { ...result, id: result._id.toString() };
  }

  async getUsageHistory(subscriptionId: string, limit = 12): Promise<Usage[]> {
    const collection = this.db.collection<Usage>('usage');
    const docs = await collection
      .find({ subscriptionId })
      .sort({ periodStart: -1 })
      .limit(limit)
      .toArray();
    return docs.map(doc => ({ ...doc, id: doc._id.toString() }));
  }
}

export const subscriptionRepository = new SubscriptionRepository();
