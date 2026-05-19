FROM node:24-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run app:build

EXPOSE 3000

# Configuration is read from environment variables (QBIT_HOST, QBIT_PORT,
# QBIT_USER, QBIT_PASSWORD, QBIT_REQUEST_TIMEOUT_MS, QBIT_MAX_RETRIES,
# QBIT_RETRY_BACKOFF_MS, PORT). See .env.template for the full list.
CMD ["node", "server.js"]
