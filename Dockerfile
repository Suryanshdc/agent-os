# One image for every service. Which program runs is decided by the Kubernetes `command`.
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

ENV NODE_ENV=production
USER node
