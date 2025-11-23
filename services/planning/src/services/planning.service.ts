import {
  Planning,
  Task,
  CreatePlanningRequest,
  UpdatePlanningRequest,
  CreateTaskRequest,
  UpdateTaskRequest,
  PlanningStatus,
  TaskStatus,
  TaskPriority,
} from '@rt/contracts';
import { createLogger } from '@rt/utils';
import { PlanningRepository } from '../repositories/planning.repository.js';

const logger = createLogger('planning-service');

export class PlanningService {
  constructor(private planningRepo: PlanningRepository) {}

  async createPlanning(request: CreatePlanningRequest): Promise<Planning> {
    try {
      const planning: Planning = {
        _id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: request.name,
        description: request.description,
        status: PlanningStatus.DRAFT,
        startDate: request.startDate,
        endDate: request.endDate,
        tasks: request.tasks?.map((task) => ({
          ...task,
          _id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          planningId: '',
          status: TaskStatus.PENDING,
          priority: task.priority || TaskPriority.MEDIUM,
          createdAt: new Date(),
          updatedAt: new Date(),
        })) || [],
        assignedTo: request.assignedTo,
        vehicleId: request.vehicleId,
        driverId: request.driverId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Set planningId for all tasks
      planning.tasks = planning.tasks.map((task) => ({
        ...task,
        planningId: planning._id!,
      }));

      const created = await this.planningRepo.create(planning);
      logger.info('Planning created', { planningId: created._id });

      return created;
    } catch (error: any) {
      logger.error('Failed to create planning', { error: error.message });
      throw error;
    }
  }

  async updatePlanning(
    id: string,
    request: UpdatePlanningRequest
  ): Promise<Planning | null> {
    try {
      const updated = await this.planningRepo.updateById(id, request);
      if (updated) {
        logger.info('Planning updated', { planningId: id });
      }
      return updated;
    } catch (error: any) {
      logger.error('Failed to update planning', {
        planningId: id,
        error: error.message,
      });
      throw error;
    }
  }

  async deletePlanning(id: string): Promise<boolean> {
    try {
      const deleted = await this.planningRepo.deleteById(id);
      if (deleted) {
        logger.info('Planning deleted', { planningId: id });
      }
      return deleted;
    } catch (error: any) {
      logger.error('Failed to delete planning', {
        planningId: id,
        error: error.message,
      });
      throw error;
    }
  }

  async getPlanning(id: string): Promise<Planning | null> {
    return this.planningRepo.findById(id);
  }

  async getAllPlannings(): Promise<Planning[]> {
    return this.planningRepo.findMany({});
  }

  async getPlanningsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Planning[]> {
    return this.planningRepo.findByDateRange(startDate, endDate);
  }

  async getPlanningsByStatus(status: PlanningStatus): Promise<Planning[]> {
    return this.planningRepo.findByStatus(status);
  }

  async getPlanningsByDriver(driverId: string): Promise<Planning[]> {
    return this.planningRepo.findByDriver(driverId);
  }

  async getPlanningsByVehicle(vehicleId: string): Promise<Planning[]> {
    return this.planningRepo.findByVehicle(vehicleId);
  }

  // Task management
  async createTask(request: CreateTaskRequest): Promise<Task> {
    try {
      const task: Task = {
        _id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        planningId: request.planningId,
        orderId: request.orderId,
        title: request.title,
        description: request.description,
        status: TaskStatus.PENDING,
        priority: request.priority || TaskPriority.MEDIUM,
        assignedTo: request.assignedTo,
        startTime: request.startTime,
        endTime: request.endTime,
        estimatedDuration: request.estimatedDuration,
        location: request.location,
        dependencies: request.dependencies,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.planningRepo.addTask(request.planningId, task);
      logger.info('Task created', { taskId: task._id, planningId: request.planningId });

      return task;
    } catch (error: any) {
      logger.error('Failed to create task', { error: error.message });
      throw error;
    }
  }

  async updateTask(
    planningId: string,
    taskId: string,
    request: UpdateTaskRequest
  ): Promise<boolean> {
    try {
      const updated = await this.planningRepo.updateTask(
        planningId,
        taskId,
        request as Partial<Task>
      );
      if (updated) {
        logger.info('Task updated', { taskId, planningId });
      }
      return updated;
    } catch (error: any) {
      logger.error('Failed to update task', {
        taskId,
        planningId,
        error: error.message,
      });
      throw error;
    }
  }

  async deleteTask(planningId: string, taskId: string): Promise<boolean> {
    try {
      const deleted = await this.planningRepo.removeTask(planningId, taskId);
      if (deleted) {
        logger.info('Task deleted', { taskId, planningId });
      }
      return deleted;
    } catch (error: any) {
      logger.error('Failed to delete task', {
        taskId,
        planningId,
        error: error.message,
      });
      throw error;
    }
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return this.planningRepo.getTasksByStatus(status);
  }
}
