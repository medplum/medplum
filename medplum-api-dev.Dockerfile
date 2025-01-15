FROM public.ecr.aws/docker/library/node:20-slim

RUN apt update
RUN apt install -y git

ENV NODE_ENV development


RUN useradd -u 8877 medplum

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

RUN npx turbo run build --filter=@medplum/server

EXPOSE 5000 8103

USER medplum

ENTRYPOINT [ "node", "--require", "./packages/server/dist/otel/instrumentation.js", "packages/server/dist/index.js" ]
