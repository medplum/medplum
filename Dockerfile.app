FROM node:16-slim
ENV NODE_ENV development
WORKDIR /usr/src/medplum
COPY package.json package-lock.json ./
COPY packages/app/package.json ./packages/app/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/definitions/package.json ./packages/definitions/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN npm ci
COPY . .
EXPOSE 3000
ENTRYPOINT [ "npm", "run", "dev", "--workspace", "packages/app" ]