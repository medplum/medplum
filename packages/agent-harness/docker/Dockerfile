# SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
# SPDX-License-Identifier: Apache-2.0
#
# Single image used by both the `harness` and `mock-releases` compose services.
# Build context MUST be the medplum monorepo root so workspace deps resolve.
#
# Usage from packages/agent-harness/docker/:
#   docker buildx build --file Dockerfile --tag medplum-agent-harness:dev ../../..

FROM node:22-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the monorepo. .dockerignore at the build root (medplum/.dockerignore)
# should exclude node_modules, dist, .git for a sane context size; if absent,
# this image will be ~big but still correct.
COPY . /app

# Install + build only what the harness needs. `--workspaces=false` plus an
# explicit workspace target keeps unrelated packages out of the install.
RUN npm ci --workspace=@medplum/agent-harness --include-workspace-root \
    && npm run build --workspace=@medplum/core \
    && npm run build --workspace=@medplum/hl7 \
    && npm run build --workspace=@medplum/agent-harness

WORKDIR /app/packages/agent-harness

# Default to the control-plane CLI; docker-compose overrides for mock-releases.
EXPOSE 7681
ENV NODE_ENV=production
CMD ["node", "dist/cli.js"]
