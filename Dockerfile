# Notes app: one container runs the Express backend, which also serves the frontend.
FROM node:22-alpine

WORKDIR /app/backend

# Install production dependencies only (bcrypt ships prebuilt binaries for Alpine/musl)
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# App source: backend + the static frontend it serves from ../frontend
COPY backend/ ./
COPY frontend/ ../frontend/

# Uploads folder owned by the non-root user, so the mounted volume is writable
RUN mkdir -p uploads && chown -R node:node /app/backend/uploads

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/billing/plans || exit 1

# Create any missing tables, then start the server
CMD ["sh", "-c", "node db/migrate.js && node server.js"]
