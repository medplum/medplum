ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npx tsc

CMD ["node", "dist/entrypoint.js", "start"]
