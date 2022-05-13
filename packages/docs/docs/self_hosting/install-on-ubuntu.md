---
sidebar_position: 2
---

# Install on Ubuntu

This guide was written for Ubuntu 20.04, although it should work for most recent versions.

## Prerequisites

First, update and upgrade the system.

```bash
sudo apt-get update
sudo apt-get upgrade
sudo reboot
```

## Install postgres

```bash
sudo apt install postgresql postgresql-contrib
```

Start postgres

```bash
sudo pg_ctlcluster 12 main start
```

Start postgres client

```bash
sudo -u postgres psql
```

Create a "medplum" user:

```PLpgSQL
CREATE USER medplum WITH PASSWORD 'medplum';
```

Create a "medplum" database:

```PLpgSQL
CREATE DATABASE medplum;
GRANT ALL PRIVILEGES ON DATABASE medplum TO medplum;
\c medplum;
CREATE EXTENSION "uuid-ossp";
```

Create a "medplum_test" database:

```PLpgSQL
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
\c medplum_test;
CREATE EXTENSION "uuid-ossp";
```

Exit psql

```PLpgSQL
exit
```

## Install redis

```bash
sudo apt-get install redis-server
```

Open the redis config file

Uncomment the "requirepass" line and set a password

```
requirepass medplum
```

Restart redis

```bash
sudo systemctl restart redis-server
```

Add the Node.js v16.x Ubuntu repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
```

Install NodeJS

```bash
sudo apt-get install nodejs
```

## Install Medplum

Clone the Medplum repository

```bash
git clone https://github.com/medplum/medplum.git
```

Run the build script

```bash
./scripts/build.sh
```

(This will take a while.  It downloads all dependencies, performs a full build, and runs all tests.)

Update the server config at packages/server/medplum.config.json with your configuration
