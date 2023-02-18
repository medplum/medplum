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
```

Create a "medplum_test" database:

```PLpgSQL
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
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

## Install Node.js

Add the Node.js v18.x Ubuntu repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
```

Install Node.js

```bash
sudo apt-get install nodejs
```

## Build Medplum

Clone the Medplum repository

```bash
git clone https://github.com/medplum/medplum.git
cd medplum
```

Install dependencies

```bash
npm ci
```

Build the server and necessary dependencies

```bash
npm run build -- --filter=@medplum/server
```

## Run Medplum server

Update the server config at packages/server/medplum.config.json with your configuration

Run in development mode (from the `packages/server` directory):

```bash
npm run dev
```

Run in production mode (from the project root directory):

```bash
node packages/server/dist/index.js
```
