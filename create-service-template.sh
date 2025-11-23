#!/bin/bash

# Script to create a basic service template
SERVICE_NAME=$1
SERVICE_PORT=$2
SERVICE_DIR="services/$SERVICE_NAME"

mkdir -p "$SERVICE_DIR/src"

# package.json
cat > "$SERVICE_DIR/package.json" <<EOF
{
  "name": "@rt/service-$SERVICE_NAME",
  "version": "1.0.0",
  "description": "$SERVICE_NAME service for RT Technologie",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --build",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "dependencies": {
    "@rt/contracts": "workspace:*",
    "@rt/utils": "workspace:*",
    "@rt/data-mongo": "workspace:*",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
EOF

# tsconfig.json
cat > "$SERVICE_DIR/tsconfig.json" <<EOF
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# src/index.ts
cat > "$SERVICE_DIR/src/index.ts" <<EOF
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger } from '@rt/utils';
import { connectToDatabase, checkDatabaseHealth } from '@rt/data-mongo';

dotenv.config();

const logger = createLogger('$SERVICE_NAME');
const app = express();
const PORT = process.env.PORT || $SERVICE_PORT;

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', async (req, res) => {
  const dbHealthy = await checkDatabaseHealth();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    service: '$SERVICE_NAME',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/$SERVICE_NAME', (req, res) => {
  res.json({ success: true, service: '$SERVICE_NAME' });
});

async function startServer() {
  try {
    await connectToDatabase();
    app.listen(PORT, () => {
      logger.info(\`$SERVICE_NAME service listening on port \${PORT}\`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
EOF

# Dockerfile
cat > "$SERVICE_DIR/Dockerfile" <<EOF
FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.4

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc* ./
COPY packages ./packages
COPY services/$SERVICE_NAME ./services/$SERVICE_NAME
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rt/contracts build && pnpm --filter @rt/utils build && pnpm --filter @rt/data-mongo build && pnpm --filter @rt/service-$SERVICE_NAME build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/$SERVICE_NAME/dist ./dist
COPY --from=builder /app/services/$SERVICE_NAME/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
EXPOSE $SERVICE_PORT
CMD ["node", "dist/index.js"]
EOF

echo "✅ Service $SERVICE_NAME created on port $SERVICE_PORT"
