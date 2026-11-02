# Medplum production Dockerfile

# This Dockerfile depends on files created by scripts/build-docker-server.sh:
#  1. `medplum-server-metadata.tar.gz` - contains package.json and package-lock.json files
#  2. `medplum-server-runtime.tar.gz` - contains the compiled JavaScript files and other runtime assets

# The archive files are decompressed and extracted into the specified destinations.
# We do this to preserve the folder structure in a single layer.
# See: https://docs.docker.com/reference/dockerfile/#adding-local-tar-archives

# Uses Docker "Hardened Images":
# https://hub.docker.com/hardened-images/catalog/dhi/node/guides
# It does not include any development dependencies.

# Builds multiarch docker images
# https://docs.docker.com/build/building/multi-platform/
# https://www.docker.com/blog/multi-arch-build-and-images-the-simple-way/

# Supported architectures:
# linux/amd64, linux/arm64
# https://github.com/docker-library/official-images#architectures-other-than-amd64

# Stage 1: Build the application and install production dependencies
FROM dhi.io/node:26.13-dev@sha256:a7e7e221f0fda5e998a3b21b000fda21397ee767a0a643f4f8e1433912edbb36 AS build-stage
ENV NODE_ENV=production
WORKDIR /usr/src/medplum
ADD ./medplum-server-metadata.tar.gz ./
RUN npm ci --omit=dev && \
  rm package-lock.json

# Stage 2: Create the runtime image
FROM dhi.io/node:26.13@sha256:dea81b92cdabf3879e8edaad05c8aa4460603b6b0351fcf6c481eb12b24c8bd5 AS runtime-stage
ENV NODE_ENV=production
WORKDIR /usr/src/medplum
COPY --from=build-stage /usr/src/medplum/ ./
ADD ./medplum-server-runtime.tar.gz ./

EXPOSE 5000 8103

ENTRYPOINT [ "node", "--experimental-loader=@opentelemetry/instrumentation/hook.mjs", "--import", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
