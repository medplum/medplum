# This is a development image for the front-end app.
# It includes all development dependencies.
# The content is served by webpack-dev-server.
# This should be launched using docker-compose.
FROM node:16-slim
ENV NODE_ENV development
WORKDIR /usr/src/medplum
COPY package.json package-lock.json ./
COPY packages/app/package.json ./packages/app/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/definitions/package.json ./packages/definitions/package.json
COPY packages/fhirpath/package.json ./packages/fhirpath/package.json
COPY packages/fhirtypes/package.json ./packages/fhirtypes/package.json
COPY packages/mock/package.json ./packages/mock/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN npm ci
COPY . .
RUN npm run build --workspace packages/definitions
RUN npm run build --workspace packages/fhirtypes
RUN npm run build --workspace packages/fhirpath
RUN npm run build --workspace packages/core
RUN npm run build --workspace packages/mock
RUN npm run build --workspace packages/ui
EXPOSE 3000
ENTRYPOINT [ "npm", "run", "dev", "--workspace", "packages/app" ]
