---
sidebar_position: 8
---

# Install from scratch

This guide provides comprehensive instructions for installing and configuring Medplum from scratch on Ubuntu 24.04. It covers all essential components including PostgreSQL database setup, Redis installation, Node.js configuration, and the core Medplum server and app deployment.

The guide also includes optional but recommended steps for setting up Nginx as a reverse proxy with SSL/TLS support, enabling secure access through custom domains. While primarily written for Ubuntu 24.04, these instructions are compatible with most recent Ubuntu versions.

This installation method is particularly useful for development and testing environments, though for production deployments, the guide notes that using AWS with CDK or other infrastructure-as-code tools is recommended.

## Install PostgreSQL

:::note

These Postgres installation steps can be skipped if you've already installed Postgres, or are using a database hosted elsewhere. Medplum server can be configured to connect to remote databases. We'll discuss how to connect to a remote Postgres server below.

:::

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

Exit psql

```PLpgSQL
exit
```

## Install Redis

```bash
sudo apt-get install redis-server
```

Open the Redis config file

```bash
sudo vi /etc/redis/redis.conf
```

Uncomment the "requirepass" line and set a password

```
requirepass medplum
```

Restart Redis

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

## Start Medplum server

:::info

These are abbreviated instructions. For full details, see [Run the stack](/docs/contributing/run-the-stack)

:::

Start the `server` in development mode:

```bash
cd packages/server
npm run dev
```

You should now be able to access the Medplum server at [http://localhost:8103/healthcheck](http://localhost:8103/healthcheck).

## Start Medplum app

:::warning[Important: Development Server vs Production Setup]

This command runs Medplum app using the Vite Dev server. While this is convenient for development and testing, it has two significant limitations:

1. The Vite dev server is designed for development, not production use. It serves files inefficiently and will provide an inferior experience for end users.
2. The Medplum app requires several modern browser features that are only available in a 'secure context' (HTTPS), including essential cryptography features. These features will not be available when accessing the app via plain HTTP.

If you plan to access the app and API from other devices on your network, we recommend proceeding to the optional SSL/nginx setup instructions below. This will provide the secure context required for all Medplum features to function correctly.

:::

In another terminal, start the `app` in development mode:

```bash
cd packages/app
npm run dev
```

You should now be able to access the Medplum app at [http://localhost:3000](http://localhost:3000).

## Optional: Nginx

:::info

While these instructions demonstrate a basic nginx setup, our primary recommendation is deploying Medplum to AWS using CDK or other infrastructure-as-code tools for production environments. This guide serves as an educational example of how the components work together and could be a viable solution for some deployments.

While this configuration is not officially supported at present, we welcome community interest - if you would like to sponsor work on publishing an official deb image and APT repository, we would love to work with you!

:::

### Overview

To run Medplum securely, you should use SSL/TLS via reverse proxy such as nginx.

To do this, you will need to:

- Install Nginx
- Install Certbot
- Setup SSL
- Add Nginx sites

Before you begin, please identify the domain names you will use for the app and api. For this example, we will use `app.example.com` and `api.example.com`.

### Update Medplum server settings

Navigate to your `server` directory:

```bash
cd medplum/packages/server
```

Update the `medplum.config.json` file with your new domain:

```js
{
  "baseUrl": "https://api.example.com"
  // ...
}
```

Restart the server. If you intend to run the server continuously and survive SSH disconnects, you may consider using `nohup`:

```bash
nohup npm run dev > server.log 2>&1 &
```

### Update Medplum app settings

In the terminal that is running `app`, you now must update the `.env` file with your new domain:

```bash
echo "MEDPLUM_BASE_URL=https://api.example.com" > .env
```

Build the app. This will generate a new version of the app in the `dist` directory:

```bash
npm run build
```

Start the "preview" server:

```bash
nohup npx vite preview > app.log 2>&1 &
```

### Install Nginx and Certbot

Install nginx and Certbot:

```bash
sudo apt-get install nginx certbot python3-certbot-nginx
```

### Setup SSL

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

### Add Nginx site for `app`

For the app, we will proxy requests to the Vite preview server running on port 4173.

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
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:4173;
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

### Add Nginx site for `api`

For the API server, we will proxy requests to the Node.js server running on port 8103.

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
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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

### Enable the sites

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

### Verify the setup

You should now be able to view the API server healthcheck at [https://api.example.com/healthcheck](https://api.example.com/healthcheck)

And the app at [https://app.example.com](https://app.example.com)
