import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth, getDatabase } from '@rt/data-mongo';
import { PlanningRepository } from './repositories/planning.repository.js';
import { PlanningService } from './services/planning.service.js';
import { createPlanningRoutes } from './routes/planning.routes.js';

dotenv.config();

const logger = createLogger('planning');
const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (_req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'planning',
    timestamp: new Date().toISOString(),
  });
});

async function startServer() {
  try {
    await connectToDatabase();
    const db = getDatabase();

    // Initialize repository and service
    const planningCollection = db.collection('plannings');
    const planningRepo = new PlanningRepository(planningCollection);
    const planningService = new PlanningService(planningRepo);

    // Setup routes
    app.use('/api/planning', createPlanningRoutes(planningService));

    app.listen(PORT, () => {
      logger.info(`Planning service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
