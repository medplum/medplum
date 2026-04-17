# syntax=docker/dockerfile:1
# Multi-stage: copy the livekit-server binary from the official image into an
# Alpine base so we have a POSIX shell for the startup script.

FROM livekit/livekit-server:latest AS livekit

FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget

COPY --from=livekit /livekit-server /usr/local/bin/livekit-server
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# HTTP/WS API | RTC TCP | RTC UDP | STUN/TURN UDP | STUN/TURN TCP | TURN-TLS
EXPOSE 7880 7881 7882/udp 3478/udp 3478 5349

ENTRYPOINT ["/entrypoint.sh"]
