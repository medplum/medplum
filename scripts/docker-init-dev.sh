#!/usr/bin/env bash

# Docker init script for development

# Fail on error
set -e

# Echo commands
set -x

# Ensure everything is up to date
apt-get update
apt-get --yes upgrade

# Install base dependencies
apt-get --yes install curl ca-certificates gnupg postgresql-common redis-server sudo

# Add the PostgreSQL PGP key to verify their Debian packages
# See instructions here: https://wiki.postgresql.org/wiki/Apt
yes "" | sh /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
apt-get update
apt-get --yes install postgresql-12
#pg_ctlcluster 12 main start
service postgresql start

# Setup PostgreSQL
sudo -u postgres psql -v ON_ERROR_STOP=1 <<-EOSQL
  CREATE USER medplum WITH PASSWORD 'medplum';
  CREATE DATABASE medplum;
  GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
  \c medplum;
  CREATE EXTENSION "uuid-ossp";
  CREATE DATABASE medplum_test;
  GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
  \c medplum_test;
  CREATE EXTENSION "uuid-ossp";
EOSQL

# Setup Redis
# By default, the requirepass config is disabled
# Enable it and change the default password to "medplum"
# Then restart the redis server
sed -i 's/# requirepass foobared/requirepass medplum/g' /etc/redis/redis.conf
/etc/init.d/redis-server restart

# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_17.x | bash -
apt-get install -y nodejs
