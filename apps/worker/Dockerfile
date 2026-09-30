FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache docker-cli docker-cli-buildx && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN pnpm install --filter @deploypilot/worker... --frozen-lockfile --ignore-scripts
RUN pnpm --filter @deploypilot/worker build
CMD ["node", "apps/worker/dist/main.js"]
