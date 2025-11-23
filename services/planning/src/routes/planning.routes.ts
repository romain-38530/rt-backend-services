import { Router, Request, Response } from 'express';
import { validateRequest } from '@rt/utils';
import {
  createPlanningSchema,
  updatePlanningSchema,
  createTaskSchema,
  updateTaskSchema,
} from '@rt/contracts';
import { PlanningService } from '../services/planning.service.js';
import { createLogger } from '@rt/utils';

const logger = createLogger('planning-routes');

export function createPlanningRoutes(planningService: PlanningService): Router {
  const router = Router();

  // Create planning
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(createPlanningSchema, req.body);
      const planning = await planningService.createPlanning(validated);

      res.status(201).json({
        success: true,
        data: planning,
      });
    } catch (error: any) {
      logger.error('Failed to create planning', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create planning',
      });
    }
  });

  // Get all plannings
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const plannings = await planningService.getAllPlannings();

      res.json({
        success: true,
        data: plannings,
      });
    } catch (error: any) {
      logger.error('Failed to get plannings', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get plannings',
      });
    }
  });

  // Get planning by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const planning = await planningService.getPlanning(id);

      if (!planning) {
        return res.status(404).json({
          success: false,
          error: 'Planning not found',
        });
      }

      res.json({
        success: true,
        data: planning,
      });
    } catch (error: any) {
      logger.error('Failed to get planning', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get planning',
      });
    }
  });

  // Update planning
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validated = validateRequest(updatePlanningSchema, req.body);
      const planning = await planningService.updatePlanning(id, validated);

      if (!planning) {
        return res.status(404).json({
          success: false,
          error: 'Planning not found',
        });
      }

      res.json({
        success: true,
        data: planning,
      });
    } catch (error: any) {
      logger.error('Failed to update planning', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update planning',
      });
    }
  });

  // Delete planning
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await planningService.deletePlanning(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Planning not found',
        });
      }

      res.json({
        success: true,
        message: 'Planning deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete planning', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete planning',
      });
    }
  });

  // Get plannings by date range
  router.get('/range/:startDate/:endDate', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.params;
      const plannings = await planningService.getPlanningsByDateRange(
        new Date(startDate),
        new Date(endDate)
      );

      res.json({
        success: true,
        data: plannings,
      });
    } catch (error: any) {
      logger.error('Failed to get plannings by date range', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get plannings by date range',
      });
    }
  });

  // Get plannings by driver
  router.get('/driver/:driverId', async (req: Request, res: Response) => {
    try {
      const { driverId } = req.params;
      const plannings = await planningService.getPlanningsByDriver(driverId);

      res.json({
        success: true,
        data: plannings,
      });
    } catch (error: any) {
      logger.error('Failed to get plannings by driver', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get plannings by driver',
      });
    }
  });

  // Task routes
  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(createTaskSchema, req.body);
      const task = await planningService.createTask(validated);

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error: any) {
      logger.error('Failed to create task', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create task',
      });
    }
  });

  router.put('/:planningId/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const { planningId, taskId } = req.params;
      const validated = validateRequest(updateTaskSchema, req.body);
      const updated = await planningService.updateTask(
        planningId,
        taskId,
        validated
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        });
      }

      res.json({
        success: true,
        message: 'Task updated successfully',
      });
    } catch (error: any) {
      logger.error('Failed to update task', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update task',
      });
    }
  });

  router.delete('/:planningId/tasks/:taskId', async (req: Request, res: Response) => {
    try {
      const { planningId, taskId } = req.params;
      const deleted = await planningService.deleteTask(planningId, taskId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Task not found',
        });
      }

      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete task', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete task',
      });
    }
  });

  return router;
}
