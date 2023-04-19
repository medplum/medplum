FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY ./dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/

ENV MEDPLUM_BASE_URL=https://fhir.dev.wearehelpful.com/

EXPOSE 80

STOPSIGNAL SIGTERM

CMD ["nginx", "-g", "daemon off;"]
