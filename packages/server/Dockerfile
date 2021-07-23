FROM node:16
ENV NODE_ENV production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --only=production
COPY dist/ dist/
COPY templates/ templates/
EXPOSE 5000
ENTRYPOINT [ "node", "dist/index.js" ]
