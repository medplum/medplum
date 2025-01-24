FROM public.ecr.aws/docker/library/node:20-slim

RUN apt update
RUN apt install -y git curl

ENV NODE_ENV development

WORKDIR /usr/src/medplum

COPY package.json .
COPY package-lock.json .
COPY turbo.json .
COPY packages ./packages
COPY tsconfig.json .
COPY tsdoc.json .
COPY api-extractor.json .

RUN npm install

RUN npm install -g @microsoft/api-extractor @microsoft/api-documenter @testing-library/jest-dom rimraf turbo

RUN npm run build -- --filter=@medplum/server

EXPOSE 5000 8103

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8103/api/healthcheck || exit 1

ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" , "aws:us-west-2:/medplum/prod/"]
