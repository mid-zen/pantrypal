# Universal container image for the arb-scanner web dashboard.
# Works on Fly.io, Render, Railway, Google Cloud Run, or any Docker host/VPS.
FROM node:22-alpine

WORKDIR /app

# Install runtime deps first (better layer caching). Only production deps
# (tsx) are needed to run the server; typescript/@types are dev-only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# Hosts inject their own PORT; default to 3000 locally. The server binds 0.0.0.0.
ENV PORT=3000
EXPOSE 3000

# Container-level health check hits the unauthenticated /healthz route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["npm", "start"]
