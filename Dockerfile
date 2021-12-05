FROM node:16-slim
ENV NODE_ENV production
WORKDIR /usr/src/medplum
ADD ./medplum-server.tar.gz ./
RUN npm ci
EXPOSE 5000
ENTRYPOINT [ "node", "packages/server/dist/index.js" ]
