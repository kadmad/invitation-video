FROM node:20-slim

# Install Chromium + ffmpeg for Remotion SSR
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy renderer package
COPY package.json package-lock.json* ./
RUN npm install

# Frontend source is mounted as volume for dev
# In production, copy it in

EXPOSE 3100
CMD ["node", "server.js"]
