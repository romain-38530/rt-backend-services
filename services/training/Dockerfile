FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.4

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY .npmrc* ./
COPY packages ./packages
COPY services/training ./services/training
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rt/contracts build && pnpm --filter @rt/utils build && pnpm --filter @rt/data-mongo build && pnpm --filter @rt/service-training build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/training/dist ./dist
COPY --from=builder /app/services/training/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
EXPOSE 3012
CMD ["node", "dist/index.js"]
