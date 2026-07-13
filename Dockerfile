# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production runtime with Playwright dependencies
FROM node:20-bookworm-slim

# Install system dependencies required by Playwright/Chromium
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package configurations
COPY backend/package*.json ./backend/
COPY scraper/package*.json ./scraper/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci --only=production

# Install scraper dependencies and chromium
WORKDIR /app/scraper
RUN npm ci --only=production
RUN npx playwright install --with-deps chromium

WORKDIR /app

# Copy application source
COPY backend/ ./backend/
COPY scraper/ ./scraper/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3000

# Start via shell script
CMD ["./start.sh"]
