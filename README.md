# SYMPHONI.A - Backend Services

Backend microservices monorepo for the SYMPHONI.A platform.

## 🚀 Quick Start

**New to this project?** Start here:
- [QUICK_START.md](QUICK_START.md) - Get running in 5 minutes
- [DEPLOY.md](DEPLOY.md) - Complete deployment guide with step-by-step instructions
- [STATUS.md](STATUS.md) - Current status of all services

**Production deployment:**
- [DEPLOYMENT_QUICK_GUIDE.md](DEPLOYMENT_QUICK_GUIDE.md) - AWS Elastic Beanstalk deployment
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) - Production infrastructure details

## 🏗️ Architecture

This is a **monorepo** using **Turborepo** + **pnpm workspaces** containing:
- 6 shared packages (`@rt/contracts`, `@rt/utils`, `@rt/security`, etc.)
- 13 microservices (admin-gateway, authz, core-orders, notifications, etc.)
- Local development with Docker Compose (MongoDB + Redis)
- Production deployment on AWS Elastic Beanstalk + MongoDB Atlas

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Apps                        │
│  (rt-frontend-apps - React/Next.js)                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  admin-gateway (Port 3001)                              │
│  - CORS configuration                                   │
│  - JWT authentication                                   │
│  - Request routing to microservices                     │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ↓                ↓                ↓
   ┌────────┐      ┌──────────┐    ┌──────────┐
   │ authz  │      │  orders  │    │ planning │
   │ :3002  │      │  :3007   │    │  :3005   │
   └────────┘      └──────────┘    └──────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ↓
              ┌─────────────────────┐
              │  MongoDB Atlas      │
              │  Redis              │
              └─────────────────────┘
```

## 📦 Services & Packages

### Shared Packages (6)

All services use these shared packages:

| Package | Description |
|---------|-------------|
| `@rt/contracts` | TypeScript types, Zod schemas, enums |
| `@rt/utils` | Logger (Winston), validators, helpers |
| `@rt/security` | JWT auth, bcrypt, RBAC permissions |
| `@rt/data-mongo` | MongoDB repositories (generic pattern) |
| `@rt/ai-client` | OpenAI & Anthropic API wrapper |
| `@rt/cloud-aws` | AWS S3 & SES services |

### Microservices (13)

| Service | Port | Status | Description |
|---------|------|--------|-------------|
| `admin-gateway` | 3001 | ✅ Complete | API Gateway with routing |
| `authz` | 3002 | ✅ Complete | Authentication & Authorization |
| `core-orders` | 3007 | ✅ Complete | Order management |
| `notifications` | 3004 | 🟡 Template | Email, SMS, Push notifications |
| `planning` | 3005 | 🟡 Template | Planning & scheduling |
| `tms-sync` | 3006 | 🟡 Template | TMS synchronization |
| `vigilance` | 3008 | 🟡 Template | Monitoring & alerts |
| `palette` | 3009 | 🟡 Template | Palette management |
| `affret-ia` | 3010 | 🟡 Template | AI freight operations |
| `training` | 3012 | 🟡 Template | Training modules |
| `ecpmr` | 3014 | 🟡 Template | Electronic CMR |
| `storage-market` | 3015 | 🟡 Template | Storage marketplace |
| `geo-tracking` | 3016 | 🟡 Template | Real-time geolocation |
| `chatbot` | 3019 | 🟡 Template | Intelligent chatbots |

**Legend:**
- ✅ **Complete** = Fully implemented with routes, services, repositories
- 🟡 **Template** = Basic structure ready for implementation

See [STATUS.md](STATUS.md) for detailed status of each service.

## 🚀 Getting Started

### Prerequisites

- ✅ Node.js >= 20.0.0
- ✅ pnpm >= 8.0.0
- ✅ Docker Desktop installed and running
- ✅ Git installed

### Local Development (Windows)

```bash
# 1. Start infrastructure (MongoDB + Redis)
START-INFRA.bat

# 2. Install dependencies
pnpm install

# 3. Start all services
pnpm dev

# 4. Create first admin user (in another terminal)
CREATE-FIRST-USER.bat

# 5. Test the API
curl http://localhost:3001/api/v1/auth/login -X POST -H "Content-Type: application/json" -d "{\"email\":\"admin@rt-technologie.com\",\"password\":\"Admin123\"}"
```

**Credentials:**
- Email: `admin@rt-technologie.com`
- Password: `Admin123`

### Run Specific Services Only

```bash
# Terminal 1 - Gateway
pnpm --filter @rt/service-admin-gateway dev

# Terminal 2 - Auth
pnpm --filter @rt/service-authz dev

# Terminal 3 - Orders
pnpm --filter @rt/service-core-orders dev
```

### Stop Everything

```bash
# Stop infrastructure
STOP-INFRA.bat

# Stop services: Ctrl+C in the terminals
```

**For complete setup instructions, see [DEPLOY.md](DEPLOY.md)**

## 🔐 Authentication & Security

### JWT-Based Authentication

1. Login via `POST /api/v1/auth/login` through the gateway
2. Receive JWT token in response
3. Include token in all requests: `Authorization: Bearer <token>`
4. Gateway validates token and routes to backend services
5. Backend services re-validate token (defense in depth)

### RBAC Permissions

The `@rt/security` package provides role-based access control:

```typescript
import { hasPermission, Permissions } from '@rt/security';

// Check permissions
if (hasPermission(user.role, Permissions.Orders.CREATE)) {
  // User can create orders
}
```

See the full permission matrix in [packages/security/src/auth/permissions.ts](packages/security/src/auth/permissions.ts)

## 🌐 Frontend Integration

### Configuration (rt-frontend-apps)

```typescript
// Use the admin-gateway as your API base URL
export const API_BASE_URL = 'http://localhost:3001/api/v1';

// Login example
const response = await fetch(`${API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@rt-technologie.com',
    password: 'Admin123'
  })
});

const { data } = await response.json();
localStorage.setItem('token', data.token);

// Use token for subsequent requests
const orders = await fetch(`${API_BASE_URL}/orders`, {
  headers: {
    'Authorization': `Bearer ${data.token}`
  }
});
```

### Available Endpoints

All requests go through the gateway at `http://localhost:3001/api/v1`:

- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Refresh token
- `GET /orders` - List orders
- `POST /orders` - Create order
- And more... (see each service's routes)

## 📊 Health Checks

All services expose a `/health` endpoint:

```bash
curl http://localhost:3001/health  # Gateway
curl http://localhost:3002/health  # Auth
curl http://localhost:3007/health  # Orders
# ... etc
```

## 🚀 Production Deployment

The backend is deployed on **AWS Elastic Beanstalk** with **MongoDB Atlas**.

See detailed deployment guides:
- [DEPLOYMENT_QUICK_GUIDE.md](DEPLOYMENT_QUICK_GUIDE.md) - Quick deployment reference
- [INFRASTRUCTURE.md](INFRASTRUCTURE.md) - Complete infrastructure documentation

### Production URLs

| Service | URL |
|---------|-----|
| Auth API | http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com |
| Orders API | http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com |
| Planning API | http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com |
| eCMR API | http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com |
| Palettes API | http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com |

## 📁 Project Structure

```
rt-backend-services/
├── packages/              # Shared packages
│   ├── contracts/         # Types, schemas, enums
│   ├── utils/            # Logger, validators
│   ├── security/         # JWT, RBAC, crypto
│   ├── data-mongo/       # MongoDB repositories
│   ├── ai-client/        # OpenAI & Anthropic
│   └── cloud-aws/        # AWS S3 & SES
├── services/              # Microservices
│   ├── admin-gateway/    # API Gateway (port 3001)
│   ├── authz/            # Auth service (port 3002)
│   ├── core-orders/      # Orders (port 3007)
│   ├── notifications/    # Notifications (port 3004)
│   └── ...               # 10 more services
├── docker-compose.yml    # Local MongoDB + Redis
├── turbo.json           # Turborepo config
├── pnpm-workspace.yaml  # Workspace config
├── .env                 # Environment variables
├── START-INFRA.bat      # Start MongoDB + Redis
├── STOP-INFRA.bat       # Stop infrastructure
└── CREATE-FIRST-USER.bat # Create admin user
```

## 🐛 Troubleshooting

### MongoDB won't start
```bash
docker logs rt-mongodb
docker compose restart mongodb
```

### Port already in use
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID)
taskkill /PID <PID> /F
```

### Auth service not responding
```bash
# Verify MongoDB connection
docker exec rt-mongodb mongosh --eval "db.adminCommand('ping')"

# Check environment variables
cat .env | grep MONGODB_URI
```

### CORS errors from frontend
Verify `CORS_ALLOWED_ORIGINS` in [.env](.env) includes your frontend URLs:
```bash
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174
```

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Get running in 5 minutes
- **[DEPLOY.md](DEPLOY.md)** - Complete deployment guide
- **[STATUS.md](STATUS.md)** - Current status of all services
- **[DEPLOYMENT_QUICK_GUIDE.md](DEPLOYMENT_QUICK_GUIDE.md)** - AWS Elastic Beanstalk deployment
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** - Production infrastructure
- **[README_FINAL.md](README_FINAL.md)** - Comprehensive technical documentation

## 🤝 Development Workflow

1. Create feature branch from `main`
2. Make changes in relevant service(s) or package(s)
3. Test locally with `pnpm dev`
4. Build with `pnpm build` (fix any TypeScript errors)
5. Commit changes with descriptive message
6. Push to GitHub and create Pull Request

## 📄 License

Proprietary - SYMPHONI.A © 2025

---

**🎉 Ready to develop?** Run `START-INFRA.bat` then `pnpm dev` to get started!
