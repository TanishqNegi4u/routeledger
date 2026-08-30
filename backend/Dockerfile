# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# RouteLedger Backend Container
# Uses the verified production-packaged Spring Boot executable jar
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S -g 10001 routeledger \
 && adduser  -S -u 10001 -G routeledger routeledger \
 && apk add --no-cache curl tzdata

ENV TZ=Asia/Kolkata \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Djava.security.egd=file:/dev/./urandom" \
    SERVER_PORT=8080

WORKDIR /app
COPY target/routeledger-api.jar /app/routeledger-api.jar
RUN chown -R routeledger:routeledger /app

USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=4s --start-period=45s --retries=10 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health/readiness || exit 1

ENTRYPOINT ["java", "-jar", "/app/routeledger-api.jar"]
