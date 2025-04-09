# Production stage with nginx
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

# Copy the built app
COPY packages/app/dist /usr/share/nginx/html

# Copy the entrypoint script
COPY scripts/app-docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3005

ENTRYPOINT ["/docker-entrypoint.sh"]
