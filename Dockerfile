FROM node:24-slim

# Install ffmpeg for video concatenation.  The `ffmpeg` binary is
# required for merging video files as described in the concat demuxer
# documentation【752097775662452†L90-L116】.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run app:build

EXPOSE 3000

# The application reads configuration from environment variables such as
# QBIT_HOST, QBIT_PORT, QBIT_USER, QBIT_PASSWORD, QBIT_REQUEST_TIMEOUT_MS,
# QBIT_MAX_RETRIES, QBIT_RETRY_BACKOFF_MS and PORT. See .env.template for
# the full list and defaults.
CMD ["node", "server.js"]
