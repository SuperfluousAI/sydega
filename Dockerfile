# Multi-stage build: compile the Vite + React app, then serve the static
# `dist/` output via a minimal nginx image. Final image is small (~25MB)
# and contains no Node runtime in production.

# ──────────────────────────────────────────────────────────────────────────
# Stage 1 — build
# ──────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Install deps first so the layer caches when only source changes.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Bring in source and build.
COPY . .
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────
# Stage 2 — serve
# ──────────────────────────────────────────────────────────────────────────
# `nginx-unprivileged` is purpose-built for running as a non-root user on
# Pod Security Standards-restricted clusters: cache dirs are pre-chowned to
# the nginx user, default listen is 8080, no `user` directive in nginx.conf.
# Plain `nginx:alpine` can't write to /var/cache/nginx/client_temp without
# root capabilities, which the platform's chart drops.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Replace the default site config so SPA routes don't 404 (every path
# falls back to index.html; the React Router-less app still benefits
# because deep links to /lessons/:id etc. would 404 otherwise).
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/sydega.conf

# The Vite build output.
COPY --from=build /app/dist /usr/share/nginx/html

# nginx-unprivileged's nginx user is UID 101.
USER 101

EXPOSE 8080

# nginx in foreground for a clean SIGTERM from kubelet.
CMD ["nginx", "-g", "daemon off;"]
