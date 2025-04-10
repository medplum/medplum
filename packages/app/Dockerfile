FROM nginx:alpine

# Copy nginx configuration
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 3005;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

# Copy and extract the app tarball
ADD ./medplum-app.tar.gz /usr/share/nginx/html

# Copy the entrypoint script
COPY ./docker-entrypoint.sh /docker-entrypoint.sh

# Make entrypoint executable and add an nginx user
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3005

# Switch to nginx user
USER nginx

ENTRYPOINT ["/docker-entrypoint.sh"]
