# This is the main production Dockerfile.
# It depends on medplum-server.tar.gz which is created by scripts/deploy-server.sh.
# This is a production ready image.
# It does not include any development dependencies.

# Builds multiarch docker images
# https://docs.docker.com/build/building/multi-platform/
# https://www.docker.com/blog/multi-arch-build-and-images-the-simple-way/

# Supported architectures:
# linux/amd64, linux/arm64, linux/arm/v7
# https://github.com/docker-library/official-images#architectures-other-than-amd64

FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /usr/src/medplum

# Add the application files
ADD ./medplum-server.tar.gz ./

# Install dependencies, create non-root user, and set permissions in one layer
RUN npm ci && \
  groupadd -r medplum && \
  useradd -r -g medplum medplum && \
  chown -R medplum:medplum /usr/src/medplum

EXPOSE 5000 8103

# Switch to the non-root user
USER medplum

ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
