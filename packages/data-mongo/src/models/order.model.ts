// @ts-nocheck
import { Order, OrderStatus, OrderType, OrderPriority } from '@rt/contracts';

/**
 * MongoDB Order document interface
 */
export interface OrderDocument extends Omit<Order, 'id'> {
  _id: string;
}

/**
 * Order creation data
 */
export interface CreateOrderData
  extends Omit<
    Order,
    | 'id'
    | 'orderNumber'
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'trackingNumber'
    | 'actualPickupAt'
    | 'actualDeliveryAt'
  > {
  status?: OrderStatus;
}

/**
 * Order update data
 */
export interface UpdateOrderData {
  status?: OrderStatus;
  priority?: OrderPriority;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  trackingNumber?: string;
  notes?: string;
  internalNotes?: string;
  actualPickupAt?: Date;
  actualDeliveryAt?: Date;
  payment?: Order['payment'];
}
