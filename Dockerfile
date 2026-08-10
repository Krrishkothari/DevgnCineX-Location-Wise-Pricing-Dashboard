# Use the official Playwright image — all system libraries for Chromium are pre-installed
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app

# Copy all package files first (for Docker layer caching)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY scraper/package.json scraper/package-lock.json ./scraper/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install root + backend + scraper deps (triggered via postinstall)
# and install frontend deps with devDependencies for the build step
RUN npm ci --include=dev && \
    npm --prefix frontend ci --include=dev

# Copy the rest of the project source code
COPY . .

# Build the frontend (Vite production bundle)
RUN npm --prefix frontend run build

# Expose the port
ENV PORT=3000
ENV PLAYWRIGHT_BROWSERS_PATH=0
EXPOSE 3000

# Start the backend server
CMD ["node", "backend/index.js"]
