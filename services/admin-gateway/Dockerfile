# Multi-stage build for admin-gateway service
FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.4

# Build stage
FROM base AS builder

WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY .npmrc ./

# Copy shared packages
COPY packages ./packages

# Copy service
COPY services/admin-gateway ./services/admin-gateway

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm --filter @rt/service-admin-gateway build

# Production stage
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/services/admin-gateway/dist ./dist
COPY --from=builder /app/services/admin-gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start service
CMD ["node", "dist/index.js"]
