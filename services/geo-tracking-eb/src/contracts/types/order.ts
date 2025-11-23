import { BaseEntity, Address, ContactInfo, TimeRange } from './common.js';
import {
  OrderStatus,
  OrderType,
  OrderPriority,
  TransportType,
  VehicleType,
  LoadType,
  PaymentStatus,
} from '../enums/index.js';

export interface Order extends BaseEntity {
  orderNumber: string;
  clientId: string;
  type: OrderType;
  status: OrderStatus;
  priority: OrderPriority;

  // Transport details
  transport?: TransportDetails;

  // Locations
  pickup: LocationDetails;
  delivery: LocationDetails;

  // Cargo
  cargo: CargoDetails[];

  // Financial
  pricing: PricingDetails;
  payment: PaymentDetails;

  // Tracking
  trackingNumber?: string;
  assignedDriverId?: string;
  assignedVehicleId?: string;

  // Metadata
  notes?: string;
  internalNotes?: string;
  documents?: string[];

  // Timestamps
  scheduledPickupAt?: Date;
  scheduledDeliveryAt?: Date;
  actualPickupAt?: Date;
  actualDeliveryAt?: Date;
}

export interface TransportDetails {
  type: TransportType;
  vehicleType: VehicleType;
  distance?: number; // in km
  duration?: number; // in minutes
  requiresInsurance: boolean;
  requiresTracking: boolean;
  specialInstructions?: string;
}

export interface LocationDetails {
  address: Address;
  contact: ContactInfo;
  timeWindow?: TimeRange;
  instructions?: string;
}

export interface CargoDetails {
  description: string;
  loadType: LoadType;
  quantity: number;
  weight: number; // in kg
  volume?: number; // in m³
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  isFragile: boolean;
  isPerishable: boolean;
  requiresRefrigeration: boolean;
  temperature?: {
    min: number;
    max: number;
  };
}

export interface PricingDetails {
  basePrice: number;
  currency: string;
  taxes: number;
  fees: number;
  discount?: number;
  totalPrice: number;
  breakdown?: PriceBreakdown[];
}

export interface PriceBreakdown {
  label: string;
  amount: number;
  description?: string;
}

export interface PaymentDetails {
  status: PaymentStatus;
  method?: string;
  paidAt?: Date;
  invoiceNumber?: string;
  invoiceUrl?: string;
}

// Request/Response types
export interface CreateOrderRequest {
  type: OrderType;
  priority?: OrderPriority;
  transport?: Omit<TransportDetails, 'distance' | 'duration'>;
  pickup: LocationDetails;
  delivery: LocationDetails;
  cargo: Omit<CargoDetails, 'id'>[];
  scheduledPickupAt?: Date;
  scheduledDeliveryAt?: Date;
  notes?: string;
}

export interface UpdateOrderRequest {
  status?: OrderStatus;
  priority?: OrderPriority;
  pickup?: LocationDetails;
  delivery?: LocationDetails;
  cargo?: CargoDetails[];
  assignedDriverId?: string;
  assignedVehicleId?: string;
  notes?: string;
  internalNotes?: string;
}

export interface OrderListQuery {
  status?: OrderStatus[];
  type?: OrderType[];
  clientId?: string;
  driverId?: string;
  fromDate?: Date;
  toDate?: Date;
  search?: string;
}
