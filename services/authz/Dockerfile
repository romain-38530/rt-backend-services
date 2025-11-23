# Multi-stage build for authz service
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
COPY services/authz ./services/authz

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages and service
RUN pnpm --filter @rt/contracts build
RUN pnpm --filter @rt/utils build
RUN pnpm --filter @rt/data-mongo build
RUN pnpm --filter @rt/security build
RUN pnpm --filter @rt/service-authz build

# Production stage
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/services/authz/dist ./dist
COPY --from=builder /app/services/authz/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start service
CMD ["node", "dist/index.js"]
