// @ts-nocheck
import { Filter } from 'mongodb';
import { BaseRepository } from './base.repository.js';
import {
  OrderDocument,
  CreateOrderData,
  UpdateOrderData,
} from '../models/order.model.js';
import { OrderStatus, OrderType, PaginationParams } from '@rt/contracts';
import { generateId } from '@rt/utils';

export class OrderRepository extends BaseRepository<OrderDocument> {
  constructor() {
    super('orders');
  }

  /**
   * Create order
   */
  async createOrder(data: CreateOrderData): Promise<OrderDocument> {
    const orderNumber = this.generateOrderNumber();

    const order: Partial<OrderDocument> = {
      ...data,
      orderNumber,
      status: data.status || OrderStatus.DRAFT,
    };

    return this.create(order as OrderDocument);
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<OrderDocument | null> {
    return this.findOne({ orderNumber } as Filter<OrderDocument>);
  }

  /**
   * Find orders by client
   */
  async findByClient(
    clientId: string,
    pagination?: PaginationParams
  ): Promise<{ data: OrderDocument[]; meta?: any }> {
    if (pagination) {
      return this.findWithPagination(
        { clientId } as Filter<OrderDocument>,
        pagination
      );
    }
    const data = await this.findMany({ clientId } as Filter<OrderDocument>);
    return { data };
  }

  /**
   * Find orders by driver
   */
  async findByDriver(
    driverId: string,
    pagination?: PaginationParams
  ): Promise<{ data: OrderDocument[]; meta?: any }> {
    if (pagination) {
      return this.findWithPagination(
        { assignedDriverId: driverId } as Filter<OrderDocument>,
        pagination
      );
    }
    const data = await this.findMany({
      assignedDriverId: driverId,
    } as Filter<OrderDocument>);
    return { data };
  }

  /**
   * Find orders by status
   */
  async findByStatus(
    status: OrderStatus | OrderStatus[],
    pagination?: PaginationParams
  ): Promise<{ data: OrderDocument[]; meta?: any }> {
    const filter = Array.isArray(status)
      ? ({ status: { $in: status } } as Filter<OrderDocument>)
      : ({ status } as Filter<OrderDocument>);

    if (pagination) {
      return this.findWithPagination(filter, pagination);
    }
    const data = await this.findMany(filter);
    return { data };
  }

  /**
   * Find orders by type
   */
  async findByType(
    type: OrderType,
    pagination?: PaginationParams
  ): Promise<{ data: OrderDocument[]; meta?: any }> {
    if (pagination) {
      return this.findWithPagination({ type } as Filter<OrderDocument>, pagination);
    }
    const data = await this.findMany({ type } as Filter<OrderDocument>);
    return { data };
  }

  /**
   * Update order
   */
  async updateOrder(
    id: string,
    data: UpdateOrderData
  ): Promise<OrderDocument | null> {
    return this.updateById(id, { $set: data as any });
  }

  /**
   * Update order status
   */
  async updateStatus(
    id: string,
    status: OrderStatus
  ): Promise<OrderDocument | null> {
    return this.updateById(id, { $set: { status } as any });
  }

  /**
   * Assign driver to order
   */
  async assignDriver(
    orderId: string,
    driverId: string
  ): Promise<OrderDocument | null> {
    return this.updateById(orderId, {
      $set: { assignedDriverId: driverId } as any,
    });
  }

  /**
   * Search orders
   */
  async search(query: string, pagination?: PaginationParams) {
    const filter: Filter<OrderDocument> = {
      $or: [
        { orderNumber: { $regex: query, $options: 'i' } },
        { 'pickup.address.city': { $regex: query, $options: 'i' } },
        { 'delivery.address.city': { $regex: query, $options: 'i' } },
        { trackingNumber: { $regex: query, $options: 'i' } },
      ],
    } as any;

    if (pagination) {
      return this.findWithPagination(filter, pagination);
    }
    const data = await this.findMany(filter);
    return { data };
  }

  /**
   * Generate unique order number
   */
  private generateOrderNumber(): string {
    const prefix = 'ORD';
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  }
}
