import {
  CreateOrderRequest,
  UpdateOrderRequest,
  OrderStatus,
  OrderListQuery,
  ApiErrorCode,
  PaginationParams,
} from '@rt/contracts';
import { OrderRepository } from '@rt/data-mongo';
import { logger } from '@rt/utils';

export class OrderService {
  private orderRepo: OrderRepository;

  constructor() {
    this.orderRepo = new OrderRepository();
  }

  /**
   * Create new order
   */
  async createOrder(clientId: string, data: CreateOrderRequest) {
    try {
      const order = await this.orderRepo.createOrder({
        ...data,
        clientId,
        status: OrderStatus.DRAFT,
        pricing: {
          basePrice: 0,
          currency: 'EUR',
          taxes: 0,
          fees: 0,
          totalPrice: 0,
        },
        payment: {
          status: 'PENDING' as any,
        },
      });

      logger.info('Order created', { orderId: order._id, clientId });
      return this.toOrderResponse(order);
    } catch (error) {
      logger.error('Failed to create order', { error, clientId });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId: string, userRole: string) {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw {
        code: ApiErrorCode.NOT_FOUND,
        message: 'Order not found',
      };
    }

    // Check permissions
    if (!this.canAccessOrder(order, userId, userRole)) {
      throw {
        code: ApiErrorCode.FORBIDDEN,
        message: 'Access denied',
      };
    }

    return this.toOrderResponse(order);
  }

  /**
   * List orders
   */
  async listOrders(
    query: OrderListQuery & PaginationParams,
    userId: string,
    userRole: string
  ) {
    // Build filter based on user role
    const filter: any = {};

    if (userRole === 'CLIENT') {
      filter.clientId = userId;
    } else if (userRole === 'DRIVER') {
      filter.assignedDriverId = userId;
    }

    if (query.status) {
      filter.status = { $in: query.status };
    }

    if (query.type) {
      filter.type = { $in: query.type };
    }

    if (query.clientId && userRole !== 'CLIENT') {
      filter.clientId = query.clientId;
    }

    if (query.driverId) {
      filter.assignedDriverId = query.driverId;
    }

    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) filter.createdAt.$gte = query.fromDate;
      if (query.toDate) filter.createdAt.$lte = query.toDate;
    }

    const result = await this.orderRepo.findWithPagination(filter, query);

    return {
      data: result.data.map((order) => this.toOrderResponse(order)),
      meta: result.meta,
    };
  }

  /**
   * Update order
   */
  async updateOrder(
    orderId: string,
    data: UpdateOrderRequest,
    userId: string,
    userRole: string
  ) {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw {
        code: ApiErrorCode.NOT_FOUND,
        message: 'Order not found',
      };
    }

    // Check permissions
    if (!this.canAccessOrder(order, userId, userRole)) {
      throw {
        code: ApiErrorCode.FORBIDDEN,
        message: 'Access denied',
      };
    }

    const updated = await this.orderRepo.updateOrder(orderId, data);

    if (!updated) {
      throw {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'Failed to update order',
      };
    }

    logger.info('Order updated', { orderId, userId });
    return this.toOrderResponse(updated);
  }

  /**
   * Delete order
   */
  async deleteOrder(orderId: string, userId: string, userRole: string) {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw {
        code: ApiErrorCode.NOT_FOUND,
        message: 'Order not found',
      };
    }

    // Only admins can delete
    if (!['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      throw {
        code: ApiErrorCode.FORBIDDEN,
        message: 'Only admins can delete orders',
      };
    }

    await this.orderRepo.deleteById(orderId);
    logger.info('Order deleted', { orderId, userId });

    return { success: true };
  }

  /**
   * Check if user can access order
   */
  private canAccessOrder(order: any, userId: string, userRole: string): boolean {
    // Admins can access all orders
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(userRole)) {
      return true;
    }

    // Clients can access their own orders
    if (userRole === 'CLIENT' && order.clientId === userId) {
      return true;
    }

    // Drivers can access assigned orders
    if (userRole === 'DRIVER' && order.assignedDriverId === userId) {
      return true;
    }

    return false;
  }

  /**
   * Convert order document to response
   */
  private toOrderResponse(order: any) {
    return {
      id: order._id,
      orderNumber: order.orderNumber,
      clientId: order.clientId,
      type: order.type,
      status: order.status,
      priority: order.priority,
      transport: order.transport,
      pickup: order.pickup,
      delivery: order.delivery,
      cargo: order.cargo,
      pricing: order.pricing,
      payment: order.payment,
      trackingNumber: order.trackingNumber,
      assignedDriverId: order.assignedDriverId,
      assignedVehicleId: order.assignedVehicleId,
      notes: order.notes,
      internalNotes: order.internalNotes,
      documents: order.documents,
      scheduledPickupAt: order.scheduledPickupAt,
      scheduledDeliveryAt: order.scheduledDeliveryAt,
      actualPickupAt: order.actualPickupAt,
      actualDeliveryAt: order.actualDeliveryAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
