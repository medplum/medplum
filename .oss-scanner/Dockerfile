# Medplum build for Anthropic's OSS Scanner (https://github.com/anthropics/oss-scanner).
#
# The scanner builds this image with network access, then runs it without network access.
# Everything the build and tests need is fetched here.
#
# Postgres and Redis are installed in the image, and the test database is seeded during the build.
# Nothing starts them automatically, so run .oss-scanner/start-services.sh before the server tests.
# See .oss-scanner/threat_model.md for how to run tests.

FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    TURBO_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=6144

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git python3 procps postgresql postgresql-contrib redis-server \
    && rm -rf /var/lib/apt/lists/*

# scanner contract: the checkout lives inside the image, at /src
COPY . /src
WORKDIR /src

# Use the npm version pinned in package.json "packageManager"
RUN npm install -g "$(node -p "require('./package.json').packageManager.split('+')[0]")"

# Install dependencies and build every package except docs, storybook and examples
RUN npm ci && npm run build

# Configure Postgres like docker-compose.yml and CI: a "medplum" superuser and database, plus the test database
RUN PG_VERSION=$(ls /etc/postgresql | sort -V | tail -n 1) \
    && cp postgres/postgres.conf "/etc/postgresql/$PG_VERSION/main/conf.d/medplum.conf" \
    && pg_ctlcluster "$PG_VERSION" main start \
    && su postgres -c "psql -c \"CREATE USER medplum WITH SUPERUSER PASSWORD 'medplum'\"" \
    && su postgres -c "createdb -O medplum medplum" \
    && PGPASSWORD=medplum psql -h localhost -U medplum -d medplum -f postgres/init_test.sql \
    && pg_ctlcluster "$PG_VERSION" main stop

# Seed the test database (migrations, structure definitions, search parameters) so the server tests are ready to run.
# A failed seed leaves the image unusable for server tests, so it fails the build.
RUN .oss-scanner/start-services.sh \
    && (cd packages/server && SHOULD_RUN_SEED_TEST=1 npm run test:seed) \
    && pg_ctlcluster "$(ls /etc/postgresql | sort -V | tail -n 1)" main stop

# Smoke test a few server tests so the image is known to work, without letting a failure abort the build
RUN .oss-scanner/start-services.sh \
    && (cd packages/server && npx vitest run --project @medplum/server src/healthcheck.test.ts src/fhir/repo.test.ts \
        || echo "WARNING: server smoke tests reported failures") \
    && pg_ctlcluster "$(ls /etc/postgresql | sort -V | tail -n 1)" main stop
