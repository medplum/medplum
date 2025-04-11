FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx configuration
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 3000;
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

USER root

# Copy and extract the app tarball
ADD ./medplum-app.tar.gz /usr/share/nginx/html

# Copy the entrypoint script
COPY ./docker-entrypoint.sh /docker-entrypoint.sh

# Grant ownership of the html dir and the entrypoint to the nginx default user/group
RUN chown -R 101:101 /usr/share/nginx/html && \
    chown 101:101 /docker-entrypoint.sh && \
    chmod +x  /docker-entrypoint.sh

EXPOSE 3000

# Switch back to the 101 UID
USER 101

ENTRYPOINT ["/docker-entrypoint.sh"]
