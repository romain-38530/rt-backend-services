import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
const orderController = new OrderController();

// All routes are protected
router.use(authMiddleware);

router.post('/', orderController.create);
router.get('/', orderController.list);
router.get('/:id', orderController.getById);
router.patch('/:id', orderController.update);
router.delete('/:id', orderController.delete);

export { router as orderRoutes };
