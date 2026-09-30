FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache openssl && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm install --filter @deploypilot/api... --frozen-lockfile
RUN pnpm --filter @deploypilot/database generate && pnpm --filter @deploypilot/api build
ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "apps/api/node_modules/tsx/dist/cli.mjs", "apps/api/src/main.ts"]
