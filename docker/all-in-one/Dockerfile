# Medplum all-in-one development image.
#
# Phase 1:
# - PostgreSQL
# - Redis
# - Medplum server
# - Medplum web app
#
# Intended for local development and CI throwaway environments.
# Not intended for production use.

FROM node:24.18-bookworm-slim AS server-deps

ENV NODE_ENV=production

WORKDIR /usr/src/medplum

ADD docker/all-in-one/medplum-server-metadata.tar.gz ./

RUN npm ci --omit=dev && \
    rm package-lock.json


FROM postgres:16-bookworm

ENV NODE_ENV=production \
    PGDATA=/data/postgres \
    POSTGRES_USER=medplum \
    POSTGRES_DB=medplum

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      nginx \
      redis-server && \
    rm -rf /var/lib/apt/lists/* && \
    rm -f /etc/nginx/sites-enabled/default

WORKDIR /usr/src/medplum

# Node runtime and production dependencies.
COPY --from=server-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=server-deps /usr/src/medplum/ ./

# Compiled Medplum server.
ADD docker/all-in-one/medplum-server-runtime.tar.gz ./

# Built Medplum web application.
ADD docker/all-in-one/medplum-app.tar.gz /usr/share/nginx/html/

COPY docker/all-in-one/nginx.conf /etc/nginx/conf.d/medplum.conf

# Reuse the existing Medplum app runtime configuration behavior.
COPY docker/all-in-one/app-entrypoint.sh /usr/local/bin/app-entrypoint.sh

COPY --chmod=755 docker/all-in-one/entrypoint.sh /usr/local/bin/medplum-all-in-one.sh

VOLUME ["/data"]

EXPOSE 3000 8103

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/medplum-all-in-one.sh"]
