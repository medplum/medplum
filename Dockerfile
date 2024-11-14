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
FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app

# Add the application files: Docker handles extracting the tarball automatically
ADD ./medplum-server.tar.gz ./

ENV PATH=/nodejs/bin:$PATH
ENV NODE_ENV=production
ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
EXPOSE 5000 8103
