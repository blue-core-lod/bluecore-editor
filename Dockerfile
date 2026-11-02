# Build the app, then serve it as static files: nothing runs in the browser's
# place, so the image needs no Node at runtime.
FROM node:24.4.0 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# What the health check reports, as bluecore-stack's start page shows it.
ARG VERSION=dev
RUN printf '{"version": "%s"}\n' "$VERSION" > dist/health.json

FROM nginx:1.27.4-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/editor
EXPOSE 80
