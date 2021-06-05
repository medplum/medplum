FROM node:16
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm i --only=production
COPY dist/ dist/
EXPOSE 5000
ENTRYPOINT [ "node", "dist/index.js" ]
