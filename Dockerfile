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

FROM --platform=$TARGETPLATFORM node:20-slim
ENV NODE_ENV production
WORKDIR /usr/src/medplum
ADD ./medplum-server.tar.gz ./
RUN npm ci --maxsockets 1
EXPOSE 5000 8103
ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
