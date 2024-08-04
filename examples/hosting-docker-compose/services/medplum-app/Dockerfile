# syntax=docker/dockerfile:1.7.1

FROM node:20-slim as builder

WORKDIR /app

ARG MEDPLUM_VERSION

RUN apt-get update && \
    apt-get install -y git && \
     git clone https://github.com/medplum/medplum.git && \
     cd medplum && \
     git checkout v${MEDPLUM_VERSION}

WORKDIR /app/medplum

RUN npm ci --maxsockets 1

ARG MEDPLUM_BASE_URL
ARG MEDPLUM_CLIENT_ID
ARG GOOGLE_CLIENT_ID
ARG RECAPTCHA_SITE_KEY
ARG MEDPLUM_REGISTER_ENABLED

RUN npm run build:fast -- --filter=app

FROM nginx:1.26.0-alpine3.19-slim as frontend

LABEL maintainer="Your name <your.name@yourname.com>"

RUN rm /usr/share/nginx/html/50x.html && \
    rm /usr/share/nginx/html/index.html

COPY --from=builder /app/medplum/packages/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

WORKDIR /usr/share/nginx/html

# Optional: Fix any file name issues (e.g., the logo file)
RUN cp img/medplum-logo-512-512.png img/medplum-logo-512x512.png
RUN cp assets/favicon-*.ico ../favicon.ico
