import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth } from '@rt/data-mongo';
import { orderRoutes } from './routes/order.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';

// Load environment variables
dotenv.config();

const logger = createLogger('core-orders');
const app = express();
const PORT = process.env.PORT || 3007;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check (public)
app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();

  const health = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: 'core-orders',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
  };

  res.status(dbHealthy ? 200 : 503).json(health);
});

// API routes
app.use('/api/orders', orderRoutes);

// Error handling
app.use(errorMiddleware);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
    },
  });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectToDatabase();
    logger.info('Database connected successfully');

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Core Orders service listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start the server
startServer();
