import { z } from 'zod';
import { PlanningStatus, TaskStatus, TaskPriority } from '../types/planning.types.js';

const locationSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const createPlanningSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  assignedTo: z.array(z.string()).optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  tasks: z.array(z.any()).optional(),
});

export const updatePlanningSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(PlanningStatus).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  assignedTo: z.array(z.string()).optional(),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
});

export const createTaskSchema = z.object({
  planningId: z.string(),
  orderId: z.string().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedTo: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  estimatedDuration: z.number().int().min(0).optional(),
  location: locationSchema.optional(),
  dependencies: z.array(z.string()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assignedTo: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  actualDuration: z.number().int().min(0).optional(),
  location: locationSchema.optional(),
});

export type CreatePlanningInput = z.infer<typeof createPlanningSchema>;
export type UpdatePlanningInput = z.infer<typeof updatePlanningSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
