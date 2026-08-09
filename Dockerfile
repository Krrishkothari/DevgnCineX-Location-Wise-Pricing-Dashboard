# Use the official Playwright image which has all required system libraries pre-installed
FROM mcr.microsoft.com/playwright:v1.61.1-noble

# Set working directory
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy sub-project package files
COPY backend/package.json backend/package-lock.json ./backend/
COPY scraper/package.json scraper/package-lock.json ./scraper/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# Install all dependencies
RUN npm ci --include=dev && \
    npm --prefix backend ci --omit=dev && \
    npm --prefix scraper ci --omit=dev && \
    npm --prefix frontend ci

# Install Chromium browser for Playwright (system deps already in base image)
RUN cd scraper && npx playwright install chromium

# Copy the rest of the project
COPY . .

# Build frontend
RUN npm --prefix frontend run build

# Expose port
ENV PORT=3000
EXPOSE 3000

# Start the backend server
CMD ["node", "backend/index.js"]
