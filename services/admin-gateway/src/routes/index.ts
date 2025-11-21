import express from 'express';
import axios from 'axios';

const router = express.Router();

// Service URLs (from environment or defaults)
const SERVICES = {
  authz: process.env.AUTHZ_URL || 'http://localhost:3002',
  orders: process.env.CORE_ORDERS_URL || 'http://localhost:3007',
  notifications: process.env.NOTIFICATIONS_URL || 'http://localhost:3004',
  planning: process.env.PLANNING_URL || 'http://localhost:3005',
  palette: process.env.PALETTE_URL || 'http://localhost:3009',
  vigilance: process.env.VIGILANCE_URL || 'http://localhost:3008',
  affretIA: process.env.AFFRET_IA_URL || 'http://localhost:3010',
  chatbot: process.env.CHATBOT_URL || 'http://localhost:3019',
  geoTracking: process.env.GEO_TRACKING_URL || 'http://localhost:3016',
};

// Proxy function
async function proxyRequest(
  serviceUrl: string,
  path: string,
  method: string,
  data?: any,
  headers?: any
) {
  try {
    const response = await axios({
      method,
      url: `${serviceUrl}${path}`,
      data,
      headers,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw {
        status: error.response.status,
        data: error.response.data,
      };
    }
    throw error;
  }
}

// Orders routes
router.all('/v1/orders*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/orders', '');
    const data = await proxyRequest(
      SERVICES.orders,
      `/api/orders${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Notifications routes
router.all('/v1/notifications*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/notifications', '');
    const data = await proxyRequest(
      SERVICES.notifications,
      `/api/notifications${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Chatbot routes
router.all('/v1/chatbot*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/chatbot', '');
    const data = await proxyRequest(
      SERVICES.chatbot,
      `/api/chatbot${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// Geo Tracking routes
router.all('/v1/tracking*', async (req, res, next) => {
  try {
    const path = req.url.replace('/v1/tracking', '');
    const data = await proxyRequest(
      SERVICES.geoTracking,
      `/api/tracking${path}`,
      req.method,
      req.body,
      req.headers
    );
    res.json(data);
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json(error.data);
    } else {
      next(error);
    }
  }
});

// API info
router.get('/v1', (req, res) => {
  res.json({
    name: 'RT Technologie API Gateway',
    version: '1.0.0',
    services: Object.keys(SERVICES),
    endpoints: [
      '/api/v1/orders',
      '/api/v1/notifications',
      '/api/v1/chatbot',
      '/api/v1/tracking',
    ],
  });
});

export { router as routes };
