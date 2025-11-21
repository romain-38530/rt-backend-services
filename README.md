# RT Technologie - Backend Services

Backend microservices for the RT Technologie platform, deployed on AWS ECS Fargate.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet                             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  Application Load Balancer (ALB)                        │
│  https://api.rt-technologie.com                         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────┐
│  admin-gateway (PUBLIC)                                 │
│  - CORS configuration                                   │
│  - JWT authentication                                   │
│  - Rate limiting                                        │
│  - Request routing                                      │
└────────────────────────┬────────────────────────────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ↓             ↓             ↓
      ┌────────┐    ┌────────┐   ┌────────┐
      │ authz  │    │ orders │   │ chatbot│
      └────────┘    └────────┘   └────────┘
           │             │             │
           └─────────────┼─────────────┘
                         │
                         ↓
              ┌─────────────────────┐
              │  MongoDB Atlas      │
              │  Redis              │
              └─────────────────────┘
```

## 📦 Services

### Core Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| `admin-gateway` | 3001 | API Gateway | authz |
| `authz` | 3002 | Authentication & Authorization | MongoDB, Redis |
| `core-orders` | 3007 | Order management | MongoDB, authz, vigilance |
| `notifications` | 3004 | Email, SMS, Push notifications | MongoDB |
| `planning` | 3005 | Planning & scheduling | MongoDB, notifications |

### AI Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| `affret-ia` | 3010 | AI freight operations | MongoDB, OpenAI, Anthropic |
| `chatbot` | 3019 | Intelligent chatbots | MongoDB, OpenAI, Anthropic |
| `tracking-ia` | - | AI tracking | MongoDB |

### Logistics Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| `geo-tracking` | 3016 | Real-time geolocation | MongoDB, TomTom API |
| `palette` | 3009 | Palette management | MongoDB, authz |
| `vigilance` | 3008 | Monitoring & alerts | MongoDB |

### Integration Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| `erp-sync` | - | ERP synchronization | MongoDB |
| `tms-sync` | 3006 | TMS synchronization | MongoDB |
| `wms-sync` | - | WMS synchronization | MongoDB |
| `ecpmr` | 3014 | Electronic CMR | MongoDB |

### Business Services

| Service | Port | Description | Dependencies |
|---------|------|-------------|--------------|
| `bourse` | - | Exchange marketplace | MongoDB |
| `storage-market` | 3015 | Storage marketplace | MongoDB, authz, OpenAI |
| `pricing-grids` | - | Pricing management | MongoDB |
| `client-onboarding` | - | Client onboarding | MongoDB, VAT API |
| `training` | 3012 | Training modules | MongoDB |

## 🚀 Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose
- MongoDB (local or Atlas)
- Redis (local or cloud)

### Installation

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration

# Build all services
pnpm build
```

### Development

```bash
# Run all services in dev mode
pnpm dev

# Run specific service
pnpm --filter @rt/service-admin-gateway dev

# Run with Docker Compose
pnpm docker:up

# View logs
pnpm docker:logs
```

### Production

```bash
# Build all services
pnpm build

# Start all services
pnpm start

# Deploy to AWS ECS
pnpm deploy
```

## 📦 Shared Packages

| Package | Description |
|---------|-------------|
| `@rt/contracts` | API contracts & types (from rt-shared-contracts) |
| `@rt/utils` | Utility functions (from rt-shared-contracts) |
| `@rt/data-mongo` | MongoDB data access layer |
| `@rt/security` | Security utilities |
| `@rt/ai-client` | AI client wrapper |
| `@rt/cloud-aws` | AWS SDK wrapper |

## 🔐 Environment Variables

### Common (All Services)

```bash
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/rt-technologie
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret
```

### Service-Specific

```bash
# AI Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Geo Tracking
TOMTOM_API_KEY=...

# Notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMS_API_KEY=...

# Admin Gateway
CORS_ALLOWED_ORIGINS=https://backoffice.rt-technologie.com,https://www.rt-technologie.com
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for specific service
pnpm --filter @rt/service-authz test

# Run tests with coverage
pnpm test:coverage
```

## 🏗️ Infrastructure

### Terraform

```bash
cd infra/terraform

# Initialize
terraform init

# Plan
terraform plan

# Apply
terraform apply
```

### AWS ECS Deployment

```bash
# Deploy all services
bash infra/scripts/deploy-services.sh

# Deploy specific service
bash infra/scripts/deploy-service.sh admin-gateway
```

## 📊 Monitoring

- **CloudWatch Logs**: All services log to CloudWatch
- **CloudWatch Metrics**: CPU, Memory, Request count
- **AWS X-Ray**: Distributed tracing
- **Health checks**: `/health` endpoint on all services

## 🔒 Security

### Authentication Flow

1. Frontend → `POST /auth/login` → authz service
2. authz validates credentials & generates JWT
3. JWT returned to frontend
4. Frontend includes JWT in `Authorization: Bearer <token>` header
5. admin-gateway validates JWT
6. Request routed to appropriate service
7. Service re-validates JWT (defense in depth)

### CORS Configuration

admin-gateway allows requests from:
- `https://backoffice.rt-technologie.com`
- `https://www.rt-technologie.com`
- All Amplify preview URLs

### Rate Limiting

- Default: 100 requests/minute per IP
- Authenticated: 1000 requests/minute per user

## 🚢 Docker

### Build Images

```bash
# Build all services
docker-compose build

# Build specific service
docker build -t rt-admin-gateway -f services/admin-gateway/Dockerfile .
```

### Run Locally

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## 📖 API Documentation

API documentation is available via Swagger UI:

- **Admin Gateway**: http://localhost:3001/api-docs
- Each service exposes its own `/api-docs` endpoint

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Update documentation
5. Create a Pull Request

## 📄 License

Proprietary - RT Technologie © 2025
