import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import subusersRoutes from './routes/subusers';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-auth';

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'RT Technologie Authentication API',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me'
      },
      subusers: {
        list: 'GET /api/subusers',
        create: 'POST /api/subusers',
        update: 'PUT /api/subusers/:id',
        delete: 'DELETE /api/subusers/:id'
      }
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/subusers', subusersRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'RT Auth API is running' });
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
