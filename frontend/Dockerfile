# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 - build the Vite bundle.
# Every dependency in package.json is pinned to an exact version, so a plain
# `npm install` is reproducible without a committed lockfile.
# ---------------------------------------------------------------------------
FROM node:20.14-alpine AS build
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 - nginx runtime, unprivileged, listening on 8080.
# nginx.conf is installed as a template so the official entrypoint can
# envsubst ${BACKEND_ORIGIN} at container start. One image, any environment.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

ENV BACKEND_ORIGIN=http://backend:8080 \
    TZ=Asia/Kolkata

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

# The stock config assumes a root master process. Drop the `user` directive and
# move the pidfile somewhere an unprivileged uid can actually write.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && sed -i -e 's|^user  *nginx;|# user directive removed: this container runs unprivileged|' \
           -e 's|^pid  *.*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
 && chown -R 101:101 /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx

USER 101:101
EXPOSE 8080

# /healthz is served by nginx itself, so a red backend never restarts the web tier.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
