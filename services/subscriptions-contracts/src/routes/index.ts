import { Router } from 'express';
import subscriptionRoutes from './subscription.routes.js';
import contractRoutes from './contract.routes.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'subscriptions-contracts',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/api', subscriptionRoutes);
router.use('/api', contractRoutes);

export default router;
