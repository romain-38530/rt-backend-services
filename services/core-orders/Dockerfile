# Multi-stage build for core-orders service
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.4

# Build stage
FROM base AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc* ./

# Copy shared packages
COPY packages ./packages

# Copy service
COPY services/core-orders ./services/core-orders

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages and service
RUN pnpm --filter @rt/contracts build
RUN pnpm --filter @rt/utils build
RUN pnpm --filter @rt/data-mongo build
RUN pnpm --filter @rt/security build
RUN pnpm --filter @rt/service-core-orders build

# Production stage
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/services/core-orders/dist ./dist
COPY --from=builder /app/services/core-orders/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3007/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start service
CMD ["node", "dist/index.js"]
