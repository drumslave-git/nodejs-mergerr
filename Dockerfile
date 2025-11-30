FROM node:18-slim

# Install ffmpeg for video concatenation.  The `ffmpeg` binary is
# required for merging video files as described in the concat demuxer
# documentation【752097775662452†L90-L116】.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

EXPOSE 3000

# The application reads configuration from environment variables such as
# QBIT_HOST, QBIT_PORT, QBIT_USER, QBIT_PASSWORD, TARGET_DIR and
# QBIT_CATEGORY.  See server.js for defaults.
CMD ["node", "server.js"]