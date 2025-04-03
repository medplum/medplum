---
sidebar_position: 3
---

# Install on Ubuntu

This guide provides step-by-step instructions for deploying Medplum on Ubuntu using our official APT repository. The installation process is streamlined through package management while maintaining the robustness and security required for production environments. This guide was tested on Ubuntu 24.04 but is compatible with most recent Ubuntu versions.

Using Medplum's APT repository offers several advantages: automated dependency management, simplified updates, and a standardized installation process. The guide covers all essential components including PostgreSQL database configuration, Redis setup, Node.js installation, and Nginx configuration with SSL/TLS support through Let's Encrypt.

This installation method is well-suited for production deployments where you want to maintain direct control over your infrastructure while benefiting from streamlined package management. It provides a balance between ease of deployment and system control, making it an excellent choice for organizations that prefer traditional Linux server architectures.

## Prerequisites

- Ubuntu 24.04
- Allow SSH access
- Allow HTTP and HTTPS access
- Public IP address for Lets Encrypt SSL certificate
- At least 4 GB of RAM
- At least 4 GB of disk space

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

Start Postgres

```bash
sudo pg_ctlcluster 16 main start
```

Start Postgres client

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

## Install Nginx

Install Nginx and Certbot:

```bash
sudo apt-get install nginx certbot python3-certbot-nginx
```

Start Nginx:

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

Before setting up SSL, make sure your domains point to your server's IP address. There should be two DNS entries, one for `app` and one for `api`. For example, `app.example.com` and `api.example.com`. Please refer to your DNS provider's documentation for more information.

Get SSL certificates from Let's Encrypt for both domains:

```bash
sudo certbot --nginx -d app.example.com
sudo certbot --nginx -d api.example.com
```

## Install Medplum

Add the Medplum Ubuntu repository:

```bash
curl -fsSL https://apt.medplum.com/setup.sh | sudo bash -
sudo apt-get update
```

Install Medplum:

```bash
sudo apt-get install medplum
```

Start Medplum:

```bash
sudo systemctl start medplum
```

## Enable the sites

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/medplum-app /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/medplum-server /etc/nginx/sites-enabled/
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

## Verify the setup

You should now be able to view the API server healthcheck at [https://api.example.com/healthcheck](https://api.example.com/healthcheck)

And the app at [https://app.example.com](https://app.example.com)

## Admin Commands

Check service status:

```bash
systemctl status medplum
```

Start service:

```bash
sudo systemctl start medplum
```

Stop service:

```bash
sudo systemctl stop medplum
```

Restart service:

```bash
sudo systemctl restart medplum
```

Check logs:

```bash
journalctl -u medplum
```

Force reinstall:

```bash
sudo apt-get install --reinstall medplum
```

Reconfigure Medplum:

:::caution

During the installation of Medplum, you will be asked for general configuration (app domain, api domain, database host). This is used to generate the correct nginx configurations and the medplum.config.json file. 
If you've missed these configuration you can reconfigure with the following command line 

:::

```bash
sudo dpkg-reconfigure medplum
```

Then force a reinstallation of Medplum.

## Additional Configuration

The Medplum server configuration is located at `/etc/medplum/medplum.config.json`. You can edit this file to change the server configuration. After editing the file, restart the Medplum service:

```bash
sudo systemctl restart medplum
```

See [Config Settings](/docs/self-hosting/config-settings) for full details on Medplum configuration settings.
