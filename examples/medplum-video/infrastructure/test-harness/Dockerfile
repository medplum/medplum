# syntax=docker/dockerfile:1.6
#
# Test-harness image.
#
# Build context: examples/medplum-video/ (the repo subdirectory, not root).
#
#   docker build \
#     -f infrastructure/test-harness/Dockerfile \
#     -t medplum-video-test-harness \
#     .
#
# The image serves the built Vite SPA from nginx with a runtime-templated
# /config.js so the same image can target any environment (dev, staging,
# prod) via ECS task env vars at container start.

# ─── Stage 1: build the SPA with Vite ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Create a minimal npm workspaces root so @medplum-video/react resolves from
# its source (packages/react/src/index.ts).  No need to copy the full monorepo.
COPY packages/react ./packages/react
COPY packages/test-harness ./packages/test-harness

RUN echo '{"name":"medplum-video-build","private":true,"workspaces":["packages/*"]}' > package.json

RUN npm install --workspaces --include-workspace-root --no-audit --no-fund --loglevel=warn

RUN npm run build --workspace=@medplum-video/test-harness

# ─── Stage 2: serve with nginx ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# SPA / runtime-config setup
COPY --from=builder /app/packages/test-harness/dist /usr/share/nginx/html
COPY infrastructure/test-harness/nginx.conf /etc/nginx/conf.d/default.conf
COPY infrastructure/test-harness/entrypoint.sh /docker-entrypoint.d/50-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/50-runtime-config.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz | grep -q ok || exit 1

# nginx's default entrypoint runs /docker-entrypoint.d/* before starting.
CMD ["nginx", "-g", "daemon off;"]
