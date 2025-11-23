import { Router, Request, Response } from 'express';
import { validateRequest } from '@rt/utils';
import {
  createTrackingSchema,
  updatePositionSchema,
  createGeofenceSchema,
  routeRequestSchema,
} from '@rt/contracts';
import { TrackingService } from '../services/tracking.service.js';
import { createLogger } from '@rt/utils';

const logger = createLogger('tracking-routes');

export function createTrackingRoutes(trackingService: TrackingService): Router {
  const router = Router();

  // Create tracking for a vehicle
  router.post('/', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(createTrackingSchema, req.body);
      const tracking = await trackingService.createTracking(validated);

      res.status(201).json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to create tracking', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create tracking',
      });
    }
  });

  // Get tracking by vehicle ID
  router.get('/vehicle/:vehicleId', async (req: Request, res: Response) => {
    try {
      const { vehicleId } = req.params;
      const tracking = await trackingService.getTracking(vehicleId);

      if (!tracking) {
        return res.status(404).json({
          success: false,
          error: 'Tracking not found',
        });
      }

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to get tracking', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get tracking',
      });
    }
  });

  // Update vehicle position
  router.post(
    '/vehicle/:vehicleId/position',
    async (req: Request, res: Response) => {
      try {
        const { vehicleId } = req.params;
        const validated = validateRequest(updatePositionSchema, req.body);
        const tracking = await trackingService.updatePosition(
          vehicleId,
          validated
        );

        if (!tracking) {
          return res.status(404).json({
            success: false,
            error: 'Tracking not found',
          });
        }

        res.json({
          success: true,
          data: tracking,
        });
      } catch (error: any) {
        logger.error('Failed to update position', { error: error.message });
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to update position',
        });
      }
    }
  );

  // Get all active tracking
  router.get('/active', async (_req: Request, res: Response) => {
    try {
      const tracking = await trackingService.getAllActiveTracking();

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to get active tracking', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get active tracking',
      });
    }
  });

  // Get tracking by driver
  router.get('/driver/:driverId', async (req: Request, res: Response) => {
    try {
      const { driverId } = req.params;
      const tracking = await trackingService.getTrackingByDriver(driverId);

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to get tracking by driver', {
        error: error.message,
      });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get tracking by driver',
      });
    }
  });

  // Get tracking by order
  router.get('/order/:orderId', async (req: Request, res: Response) => {
    try {
      const { orderId } = req.params;
      const tracking = await trackingService.getTrackingByOrder(orderId);

      if (!tracking) {
        return res.status(404).json({
          success: false,
          error: 'Tracking not found for this order',
        });
      }

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to get tracking by order', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get tracking by order',
      });
    }
  });

  // Get nearby vehicles
  router.get('/nearby', async (req: Request, res: Response) => {
    try {
      const { lat, lon, radius } = req.query;

      if (!lat || !lon || !radius) {
        return res.status(400).json({
          success: false,
          error: 'Missing parameters: lat, lon, radius are required',
        });
      }

      const tracking = await trackingService.getNearbyVehicles(
        parseFloat(lat as string),
        parseFloat(lon as string),
        parseFloat(radius as string)
      );

      res.json({
        success: true,
        data: tracking,
      });
    } catch (error: any) {
      logger.error('Failed to get nearby vehicles', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get nearby vehicles',
      });
    }
  });

  // Geofence routes
  router.post('/geofences', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(createGeofenceSchema, req.body);
      const geofence = await trackingService.createGeofence(validated);

      res.status(201).json({
        success: true,
        data: geofence,
      });
    } catch (error: any) {
      logger.error('Failed to create geofence', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create geofence',
      });
    }
  });

  router.get('/geofences', async (_req: Request, res: Response) => {
    try {
      const geofences = await trackingService.getGeofences();

      res.json({
        success: true,
        data: geofences,
      });
    } catch (error: any) {
      logger.error('Failed to get geofences', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get geofences',
      });
    }
  });

  router.delete('/geofences/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await trackingService.deleteGeofence(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Geofence not found',
        });
      }

      res.json({
        success: true,
        message: 'Geofence deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete geofence', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete geofence',
      });
    }
  });

  // Route calculation
  router.post('/route', async (req: Request, res: Response) => {
    try {
      const validated = validateRequest(routeRequestSchema, req.body);
      const route = await trackingService.calculateRoute(validated);

      res.json({
        success: true,
        data: route,
      });
    } catch (error: any) {
      logger.error('Failed to calculate route', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to calculate route',
      });
    }
  });

  // History
  router.get(
    '/vehicle/:vehicleId/history',
    async (req: Request, res: Response) => {
      try {
        const { vehicleId } = req.params;
        const { startDate, endDate } = req.query;

        const history = await trackingService.getHistory(
          vehicleId,
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );

        res.json({
          success: true,
          data: history,
        });
      } catch (error: any) {
        logger.error('Failed to get tracking history', {
          error: error.message,
        });
        res.status(500).json({
          success: false,
          error: error.message || 'Failed to get tracking history',
        });
      }
    }
  );

  return router;
}
