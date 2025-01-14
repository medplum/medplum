FROM public.ecr.aws/docker/library/node:21.7.3

RUN apt update
RUN apt install -y git

ENV NODE_ENV development

WORKDIR /usr/app

RUN git clone https://github.com/claimpowerehr/medplum.git .

RUN npm install
RUN npm install -g @microsoft/api-extractor @microsoft/api-documenter @testing-library/jest-dom rimraf turbo

RUN npx turbo run build --filter=@medplum/server

#RUN sed -i "45 i      ssl: { rejectUnauthorized: false }," packages/server/dist/database.js

EXPOSE 5000 8103
ENTRYPOINT [ "node", "packages/server/dist/index.js", "aws:us-east-2:/medplum/dev/" ]
