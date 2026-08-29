# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - build the fat jar.
# Dependencies are resolved in their own layer so that a source-only change
# does not re-download the world on every rebuild.
# ---------------------------------------------------------------------------
FROM maven:3.9.6-eclipse-temurin-21 AS build
WORKDIR /build

COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B clean package -DskipTests=false

# ---------------------------------------------------------------------------
# Stage 2 - runtime. JRE only, non-root, no build tooling in the image.
# ---------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup -S -g 10001 routeledger \
 && adduser  -S -u 10001 -G routeledger routeledger \
 && apk add --no-cache curl tzdata

ENV TZ=Asia/Kolkata \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Djava.security.egd=file:/dev/./urandom" \
    SERVER_PORT=8080

WORKDIR /app
COPY --from=build /build/target/routeledger-api.jar /app/routeledger-api.jar
RUN chown -R routeledger:routeledger /app

USER 10001:10001
EXPOSE 8080

# Actuator liveness is the cheapest honest signal that Spring finished booting
# and Flyway did not blow up on the way.
HEALTHCHECK --interval=15s --timeout=4s --start-period=70s --retries=8 \
  CMD curl -fsS http://127.0.0.1:8080/actuator/health/readiness || exit 1

ENTRYPOINT ["java", "-jar", "/app/routeledger-api.jar"]
