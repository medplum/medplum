FROM --platform=linux/amd64 debian:bullseye-slim

ARG GIT_SHA
ARG MEDPLUM_VERSION

ENV GIT_SHA ${GIT_SHA}
ENV MEDPLUM_VERSION ${MEDPLUM_VERSION}

RUN adduser -u 5678 --disabled-password --gecos "" app

COPY bin/medplum-agent-${MEDPLUM_VERSION}-linux /srv/medplum-agent
RUN chmod +x /srv/medplum-agent

WORKDIR /srv

USER app

CMD ./medplum-agent $MEDPLUM_BASE_URL $MEDPLUM_CLIENT_ID $MEDPLUM_CLIENT_SECRET $MEDPLUM_AGENT_ID
