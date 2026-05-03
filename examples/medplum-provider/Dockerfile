# Stage 1: Build
FROM node:22-alpine AS builder

ARG VITE_MEDPLUM_BASE_URL=http://localhost:8103/

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .

RUN VITE_MEDPLUM_BASE_URL=${VITE_MEDPLUM_BASE_URL} npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config to support SPA routing (client-side routing)
RUN printf 'server {\n\
  listen 3001;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 3001
