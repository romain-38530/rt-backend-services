import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ordersRoutes from './routes/orders';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3030;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-orders';

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'RT Technologie Orders API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      orders: {
        list: 'GET /api/v1/orders',
        create: 'POST /api/v1/orders',
        get: 'GET /api/v1/orders/:id',
        update: 'PUT /api/v1/orders/:id',
        delete: 'DELETE /api/v1/orders/:id'
      }
    }
  });
});

app.use('/api/v1/orders', ordersRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'RT Orders API is running' });
});

// Connect to MongoDB and start server
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });
