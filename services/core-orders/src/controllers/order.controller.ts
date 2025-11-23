import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/order.service.js';
import { validate } from '@rt/utils';
import { createOrderSchema, updateOrderSchema, orderListQuerySchema } from '@rt/contracts';

export class OrderController {
  private orderService: OrderService;

  constructor() {
    this.orderService = new OrderService();
  }

  /**
   * POST /api/orders
   */
  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      const data = validate(createOrderSchema, req.body);
      const order = await this.orderService.createOrder(userId, data);

      res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/orders/:id
   */
  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      const order = await this.orderService.getOrderById(id, userId, userRole);

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/orders
   */
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      const query = validate(orderListQuerySchema, req.query);

      const result = await this.orderService.listOrders(query, userId, userRole);

      res.json({
        success: true,
        data: result.data,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/orders/:id
   */
  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      const data = validate(updateOrderSchema, req.body);

      const order = await this.orderService.updateOrder(id, data, userId, userRole);

      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/orders/:id
   */
  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      const result = await this.orderService.deleteOrder(id, userId, userRole);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
