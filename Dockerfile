# This is the main production Dockerfile.
# It depends on medplum-server.tar.gz which is created by scripts/deploy-server.sh.
# This is a production ready image.
# It does not include any development dependencies.
FROM node:16-slim
ENV NODE_ENV production
WORKDIR /usr/src/medplum
ADD ./medplum-server.tar.gz ./
RUN npm ci
EXPOSE 5000 8103
ENTRYPOINT [ "node", "packages/server/dist/index.js" ]
