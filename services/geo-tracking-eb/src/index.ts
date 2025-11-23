import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth, getDatabase } from '@rt/data-mongo';
import {
  TrackingRepository,
  TrackingHistoryRepository,
  GeofenceRepository,
  GeofenceEventRepository,
} from './repositories/tracking.repository.js';
import { TrackingService } from './services/tracking.service.js';
import { createTrackingRoutes } from './routes/tracking.routes.js';

dotenv.config();

const logger = createLogger('geo-tracking');
const app = express();
const PORT = process.env.PORT || 3016;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'geo-tracking',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  try {
    await connectToDatabase();
    const db = getDatabase();

    // Initialize repositories
    const trackingCollection = db.collection('vehicle_tracking');
    const historyCollection = db.collection('tracking_history');
    const geofenceCollection = db.collection('geofences');
    const geofenceEventCollection = db.collection('geofence_events');

    const trackingRepo = new TrackingRepository(trackingCollection);
    const historyRepo = new TrackingHistoryRepository(historyCollection);
    const geofenceRepo = new GeofenceRepository(geofenceCollection);
    const geofenceEventRepo = new GeofenceEventRepository(geofenceEventCollection);

    // Initialize service
    const trackingService = new TrackingService(
      trackingRepo,
      historyRepo,
      geofenceRepo,
      geofenceEventRepo
    );

    // Setup routes
    app.use('/api/tracking', createTrackingRoutes(trackingService));

    app.listen(PORT, () => {
      logger.info(`Geo-tracking service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
