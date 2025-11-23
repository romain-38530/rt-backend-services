import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth, getDatabase } from '@rt/data-mongo';
import { NotificationRepository } from './repositories/notification.repository.js';
import { NotificationService } from './services/notification.service.js';
import { createNotificationRoutes } from './routes/notification.routes.js';

dotenv.config();

const logger = createLogger('notifications');
const app = express();
const PORT = process.env.PORT || 3004;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'notifications',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  try {
    await connectToDatabase();
    const db = getDatabase();

    // Initialize repository and service
    const notificationCollection = db.collection('notifications');
    const notificationRepo = new NotificationRepository(notificationCollection);
    const notificationService = new NotificationService(notificationRepo);

    // Setup routes
    app.use('/api/notifications', createNotificationRoutes(notificationService));

    app.listen(PORT, () => {
      logger.info(`Notifications service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
