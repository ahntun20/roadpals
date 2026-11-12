# Build from the repo root:  docker build -f server/Dockerfile -t roadpals-server .
FROM node:22-alpine
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/
COPY simulator/package.json simulator/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY server server
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
WORKDIR /repo/server
CMD ["npx", "tsx", "src/index.ts"]
