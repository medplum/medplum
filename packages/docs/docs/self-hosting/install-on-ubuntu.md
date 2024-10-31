---
sidebar_position: 2
---

# Install on Ubuntu

This guide was last updated for Ubuntu 24.04, although it should work for most recent versions.

## Prerequisites

First, update and upgrade the system.

```bash
sudo apt-get update
sudo apt-get upgrade
sudo reboot
```

## Install postgres

Add the PostgreSQL Apt Repository (see [PostgreSQL Apt Repository docs](https://www.postgresql.org/download/linux/ubuntu/))

```bash
# Configure the Apt repository
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

# Install Postgres 16
sudo apt install postgresql-16 postgresql-client-16
```

Start postgres

```bash
sudo pg_ctlcluster 16 main start
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
\c medplum
GRANT ALL ON SCHEMA public TO medplum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO medplum;
```

Create a "medplum_test" database:

```PLpgSQL
CREATE DATABASE medplum_test;
GRANT ALL PRIVILEGES ON DATABASE medplum_test TO medplum;
\c medplum_test
GRANT ALL ON SCHEMA public TO medplum;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO medplum;
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

```bash
sudo vi /etc/redis/redis.conf
```

Uncomment the "requirepass" line and set a password

```
requirepass medplum
```

Restart redis

```bash
sudo systemctl restart redis-server
```

## Install Node.js

Add the Node.js v22.x Ubuntu repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
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

Build the server, app, and necessary dependencies

```bash
npm run build:fast
```

## Start Medplum

:::info

These are abbreviated instructions. For full details, see [Run the stack](/docs/contributing/run-the-stack)

:::

In one terminal, start the `server` in development mode:

```bash
cd packages/server
npm run dev
```

In another terminal, start the `app` in development mode:

```bash
cd packages/app
npm run dev
```

You should now be able to access the Medplum app at [http://localhost:3000](http://localhost:3000).

## Optional: Add nginx as a reverse proxy

To run Medplum securely, you should use SSL/TLS via reverse proxy such as nginx.

Install nginx and Certbot:

```bash
sudo apt-get install nginx certbot python3-certbot-nginx
```

Before setting up SSL, make sure your domains point to your server and Nginx is running:

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

Get SSL certificates from Let's Encrypt for both domains:

```bash
sudo certbot --nginx -d app.example.com
sudo certbot --nginx -d api.example.com
```

Create an `app` config file such as `/etc/nginx/sites-available/app.example.com`:

```nginx
# /etc/nginx/sites-available/app.example.com
server {
    listen 80;
    listen [::]:80;
    server_name app.example.com;

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Create a `api` config file such as `/etc/nginx/sites-available/api.example.com`:

```nginx
# /etc/nginx/sites-available/api.example.com
server {
    listen 80;
    listen [::]:80;
    server_name api.example.com;

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8103;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/app.example.com /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.example.com /etc/nginx/sites-enabled/
```

Remove the default site:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

Test the configuration:

```bash
sudo nginx -t
```

If the test is successful, reload Nginx:

```bash
sudo systemctl reload nginx
```

In the terminal that is running `app`, you now must update the `.env` file with your new domain:

```bash
echo "MEDPLUM_BASE_URL=https://api.example.com" > .env
```

Then restart the dev server:

```bash
npm run dev
```
