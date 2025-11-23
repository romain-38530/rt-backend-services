import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth } from '@rt/data-mongo';

dotenv.config();

const logger = createLogger('vigilance');
const app = express();
const PORT = process.env.PORT || 3008;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'vigilance',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/vigilance', (req, res) => {
  res.json({ success: true, service: 'vigilance' });
});

async function startServer() {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      logger.info(`vigilance service listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
