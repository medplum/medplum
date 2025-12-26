# This is the main production Dockerfile.
# It depends on files created by scripts/build-docker-server.sh:
#  1. `medplum-server-metadata.tar.gz` - contains package.json and package-lock.json files
#  2. `medplum-server-runtime.tar.gz` - contains the compiled JavaScript files and other runtime assets
# This is a production ready image.
# It does not include any development dependencies.

# Uses Docker "Hardened Images":
# https://hub.docker.com/hardened-images/catalog/dhi/node/guides

# Builds multiarch docker images
# https://docs.docker.com/build/building/multi-platform/
# https://www.docker.com/blog/multi-arch-build-and-images-the-simple-way/

# Supported architectures:
# linux/amd64, linux/arm64, linux/arm/v7
# https://github.com/docker-library/official-images#architectures-other-than-amd64

# Stage 1: Build the application and install production dependencies
FROM dhi.io/node:24-dev AS build-stage
ENV NODE_ENV=production
WORKDIR /usr/src/medplum
ADD ./medplum-server-metadata.tar.gz ./
RUN npm ci --omit=dev && \
  rm package-lock.json

# Stage 2: Create the runtime image
FROM dhi.io/node:24 AS runtime-stage
ENV NODE_ENV=production
WORKDIR /usr/src/medplum
COPY --from=build-stage /usr/src/medplum/ ./

# Add the application files
# The archive is decompressed and extracted into the specified destination.
# We do this to preserve the folder structure in a single layer.
# See: https://docs.docker.com/reference/dockerfile/#adding-local-tar-archives
ADD ./medplum-server-runtime.tar.gz ./

EXPOSE 5000 8103

ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
