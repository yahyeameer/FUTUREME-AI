# TOMORA: the Next.js app and its Docker Agent future-self agent in one image.
#   docker build -t futureme .
#   docker run -p 3000:3000 -v futureme-data:/data -e NEBIUS_API_KEY=... -e NEBIUS_MODEL=... futureme

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
# Toolchain for better-sqlite3 when no prebuilt binary matches the Node version.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
ARG DOCKER_AGENT_VERSION=v1.150.0
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL "https://github.com/docker/docker-agent/releases/download/${DOCKER_AGENT_VERSION}/docker-agent-linux-${TARGETARCH:-amd64}" -o /usr/local/bin/docker-agent \
  && chmod +x /usr/local/bin/docker-agent \
  && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    TELEMETRY_ENABLED=false \
    DATABASE_PATH=/data/futureme.db \
    VAULT_DIR=/data/vault \
    PORT=3000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/agents ./agents
COPY --from=build /app/mcp ./mcp
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib ./src/lib

VOLUME /data
EXPOSE 3000
CMD ["./scripts/start.sh"]
