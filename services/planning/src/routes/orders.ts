import { Router, Request, Response } from 'express';
import Order from '../models/Order';

const router = Router();

// Get all orders
router.get('/', async (req: Request, res: Response) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get single order
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Create order
router.post('/', async (req: Request, res: Response) => {
  try {
    const order = await Order.create(req.body);
    res.status(201).json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Update order
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Delete order
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
