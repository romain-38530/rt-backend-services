import { Router } from 'express';
import { subscriptionController } from '../controllers/index.js';

const router = Router();

// Subscription Plans
router.post('/plans', subscriptionController.createPlan.bind(subscriptionController));
router.get('/plans', subscriptionController.getAllPlans.bind(subscriptionController));
router.get('/plans/:id', subscriptionController.getPlanById.bind(subscriptionController));
router.put('/plans/:id', subscriptionController.updatePlan.bind(subscriptionController));
router.delete('/plans/:id', subscriptionController.deactivatePlan.bind(subscriptionController));

// Subscriptions
router.post('/subscriptions', subscriptionController.createSubscription.bind(subscriptionController));
router.get('/subscriptions/:id', subscriptionController.getSubscriptionById.bind(subscriptionController));
router.get('/subscriptions/user/:userId/active', subscriptionController.getActiveSubscription.bind(subscriptionController));
router.put('/subscriptions/:id', subscriptionController.updateSubscription.bind(subscriptionController));
router.post('/subscriptions/:id/cancel', subscriptionController.cancelSubscription.bind(subscriptionController));
router.post('/subscriptions/:id/renew', subscriptionController.renewSubscription.bind(subscriptionController));

// Invoices
router.post('/invoices', subscriptionController.createInvoice.bind(subscriptionController));
router.get('/invoices/:id', subscriptionController.getInvoiceById.bind(subscriptionController));
router.get('/invoices/subscription/:subscriptionId', subscriptionController.getInvoicesBySubscription.bind(subscriptionController));
router.get('/invoices/user/:userId', subscriptionController.getInvoicesByUser.bind(subscriptionController));
router.put('/invoices/:id', subscriptionController.updateInvoice.bind(subscriptionController));
router.post('/invoices/:id/pay', subscriptionController.markInvoicePaid.bind(subscriptionController));

// Payments
router.get('/payments/invoice/:invoiceId', subscriptionController.getPaymentsByInvoice.bind(subscriptionController));

// Usage Tracking
router.post('/usage', subscriptionController.updateUsage.bind(subscriptionController));
router.get('/usage/:subscriptionId/current', subscriptionController.getCurrentUsage.bind(subscriptionController));
router.get('/usage/:subscriptionId/limits', subscriptionController.checkUsageLimits.bind(subscriptionController));

export default router;
