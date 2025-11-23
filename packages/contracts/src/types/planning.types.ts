import { BaseEntity } from './common.js';

export enum PlanningStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DELAYED = 'DELAYED',
  CANCELLED = 'CANCELLED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface Planning extends BaseEntity {
  name: string;
  description?: string;
  status: PlanningStatus;
  startDate: Date;
  endDate: Date;
  tasks: Task[];
  assignedTo?: string[]; // User IDs
  vehicleId?: string;
  driverId?: string;
  metadata?: Record<string, any>;
}

export interface Task extends BaseEntity {
  planningId: string;
  orderId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string; // User ID
  startTime: Date;
  endTime: Date;
  estimatedDuration?: number; // in minutes
  actualDuration?: number; // in minutes
  location?: Location;
  dependencies?: string[]; // Task IDs that must be completed first
  metadata?: Record<string, any>;
}

export interface Location {
  address: string;
  city: string;
  postalCode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface CreatePlanningRequest {
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  assignedTo?: string[];
  vehicleId?: string;
  driverId?: string;
  tasks?: Omit<Task, '_id' | 'planningId' | 'createdAt' | 'updatedAt'>[];
}

export interface UpdatePlanningRequest {
  name?: string;
  description?: string;
  status?: PlanningStatus;
  startDate?: Date;
  endDate?: Date;
  assignedTo?: string[];
  vehicleId?: string;
  driverId?: string;
}

export interface CreateTaskRequest {
  planningId: string;
  orderId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignedTo?: string;
  startTime: Date;
  endTime: Date;
  estimatedDuration?: number;
  location?: Location;
  dependencies?: string[];
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  startTime?: Date;
  endTime?: Date;
  actualDuration?: number;
  location?: Location;
}
