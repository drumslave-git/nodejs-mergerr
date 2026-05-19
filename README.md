# nodejs-mergerr

A small Node.js + React companion for [qBittorrent](https://www.qbittorrent.org/) that lets you **merge** multi-part video torrents and **remux** videos with external audio tracks into a single MP4 — straight from a web UI, with live `ffmpeg` output streamed back over Server-Sent Events.

Useful for tidying up downloads that arrive as `CD1.mkv` + `CD2.mkv`, or as `movie.mkv` + a separate `movie.eng.aac` track.

---

## Features

- **Merge** multi-part video torrents (`CD1.mkv`, `CD2.mkv`, ...) into a single `MyMovie.mp4` via `ffmpeg -f concat -c copy` (no re-encode).
- **Remux** a video file together with matching external audio tracks (`movie.mkv` + `movie.eng.aac` + `movie.commentary.mka`) into one MP4 with properly labelled audio streams (`-c copy`, no re-encode).
- **Batch remux** an entire torrent folder in parallel with a configurable thread count.
- Browse completed torrents by qBittorrent **category**.
- **Live ffmpeg log** streamed to the browser over Server-Sent Events.
- Persists category, tab, theme and thread count in `localStorage`.
- Light / dark / system theme.
- Hardened qBittorrent client: per-request timeout, exponential-backoff retry on transient network errors, single-flight login, rich error logging.

---

## How it works

```
                      +---------------------+
                      |   React UI (Vite)   |
                      | /api/*  /events SSE |
                      +----------+----------+
                                 |
                                 v
+--------------+         +----------------+         +----------------+
|  qBittorrent | <-----> | Node server    | <-----> |  ffmpeg child  |
|   Web API    |  HTTPS  | (server.js)    | spawn() |   process      |
+--------------+         +----------------+         +----------------+
                                 |
                                 v
                       +----------------------+
                       | TORRENTS_DIR (bind)  |
                       | reads & writes files |
                       +----------------------+
```

1. The Node server logs into qBittorrent and lists **completed** torrents in the selected category.
2. For each torrent it fetches the file list and classifies the contents:
   - Two or more video files in the top-level folder → **mergeable**.
   - One video file plus matching external audio (`.aac`, `.mka`, `.ac3`, `.dts`, ...) → **remuxable**.
3. When the user clicks Merge / Remux, the server spawns `ffmpeg` and pipes its `stdout` + `stderr` to the browser over `/events` (SSE).
4. The container reads and writes files directly inside `TORRENTS_DIR`, which must be bind-mounted to the same absolute path qBittorrent reports for its torrents.

> **Important:** the app reads `torrent.save_path` from qBittorrent verbatim. Mount your downloads volume in this container at the **same** absolute path qBittorrent uses (e.g. `/arrs/torrents` → `/arrs/torrents`). Otherwise the file lookups will fail with `ENOENT`.

---

## Requirements

- Docker (recommended) **or** Node.js 24+ and `ffmpeg` on `PATH`
- A reachable qBittorrent Web UI (4.1+)
- The same filesystem view of the torrents directory as qBittorrent has

---

## Configuration

All configuration is via environment variables. See [`.env.template`](./.env.template) for the canonical list with inline documentation. Quick reference:

### qBittorrent connection

| Variable        | Default     | Notes |
|-----------------|-------------|-------|
| `QBIT_HOST`     | `localhost` | Hostname or full base URL. `https://qb.example.com` works. |
| `QBIT_PORT`     | `8080`      | Use `443` when `QBIT_HOST` is `https://...`. |
| `QBIT_USER`     | _(empty)_   | Leave both blank if qBittorrent auth bypass is enabled. |
| `QBIT_PASSWORD` | _(empty)_   | |

### qBittorrent client tuning (optional)

| Variable                  | Default | Range          | What it does |
|---------------------------|---------|----------------|--------------|
| `QBIT_REQUEST_TIMEOUT_MS` | `10000` | 1000 – 120000  | Per-request timeout via `AbortSignal.timeout()`. |
| `QBIT_MAX_RETRIES`        | `3`     | 1 – 10         | Total attempts per request. Only retries on transient network errors (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, undici socket / connect timeouts, ...). HTTP 4xx/5xx are never retried. |
| `QBIT_RETRY_BACKOFF_MS`   | `500`   | 0 – 30000      | Base backoff between retries, doubled each attempt (e.g. 500 → 1000 → 2000). |

### Server / infrastructure

| Variable             | Default     | Notes |
|----------------------|-------------|-------|
| `PORT`               | `3000`      | Port the Node server listens on inside the container. |
| `WEB_UI_PORT`        | `5555`      | Host port published by compose. |
| `TORRENTS_DIR`       | _(none)_    | Container-side path the torrents directory is mounted at. Must match qBittorrent's view of those paths. |
| `TORRENTS_DIR_HOST`  | _(none)_    | Host-side path that gets bind-mounted to `TORRENTS_DIR`. |

---

## Running with Docker

### Production (`compose.yml`)

Reads container env from [`stack.env`](./stack.env). Designed to drop into Portainer as a stack, or run from the shell.

```bash
cp .env.template stack.env       # then edit stack.env with real values
npm run docker:up                # builds and starts in detached mode
npm run docker:down              # stops the stack
```

Compose precedence (top wins):

1. Variables supplied by your shell / Portainer / CI (forwarded by the bare `environment:` list in `compose.yml`)
2. `stack.env`
3. Built-in defaults in `server/config.js`

This means Portainer stack variables transparently override `stack.env`, and `stack.env` overrides the in-code defaults — without any value ever being silently clobbered by an empty string.

### Development (`compose.dev.yml`)

Mounts the working directory into the container and runs Vite + the Node server with `--watch` for hot reload. Reads container env from `.env`.

```bash
cp .env.template .env            # then edit .env with real values
npm run docker:dev:up            # builds and starts in detached mode
npm run docker:dev:down
```

The published port (`WEB_UI_PORT`) maps to Vite's dev server on container port `5555`. Vite proxies `/api/*` and `/events` to the Node server on `localhost:3000` inside the same container.

---

## Running locally (without Docker)

You need Node.js 24+ and `ffmpeg` on your `PATH`.

```bash
cp .env.template .env            # then edit .env with real values
npm ci
npm start                        # runs `node --watch server.js` + Vite concurrently
```

- API + SSE: `http://localhost:3000`
- UI (with proxy to API): `http://localhost:5555`

For a production-style local run:

```bash
npm run app:build                # builds the React app into dist/
npm run server:start             # serves dist/ + API on PORT (default 3000)
```

---

## HTTP API

| Method | Path                                | Purpose |
|--------|-------------------------------------|---------|
| GET    | `/api/categories`                   | List qBittorrent categories (`{ categories: [{ id, name, path }] }`). |
| GET    | `/api/media?category=<id>`          | List mergeable torrents in a category. |
| GET    | `/api/remux?category=<id>`          | List remuxable torrents in a category. |
| POST   | `/api/merge`                        | Body: `{ id, category }`. Starts a merge job. Returns `{ status, jobId, channel }`. |
| POST   | `/api/remux`                        | Body: `{ id, category, mode?: 'single'\|'all', threads?: 1..16 }`. Starts a remux job. |
| GET    | `/events`                           | Server-Sent Events stream of ffmpeg output. Each event is `{ channel, message }`; clients filter by `channel`. |

Errors:

- `400` — missing or invalid body / category / id.
- `404` — unknown category.
- `502` — `qBittorrent unavailable` or `qBittorrent response invalid`. Means the upstream qBittorrent call failed after all retries; check server logs for the underlying `causeCode` (e.g. `ECONNRESET`).

---

## Troubleshooting

**`qBittorrent categories fetch failed`** — the most common errors and what they mean (visible in server logs now that errors include `causeCode` / `causeMessage`):

| `causeCode` | Likely cause | Fix |
|-------------|--------------|-----|
| `ECONNREFUSED` | qBittorrent isn't listening on `QBIT_HOST:QBIT_PORT`. | Check qBittorrent is running and Web UI is enabled. |
| `ECONNRESET` / `UND_ERR_SOCKET` | Connection dropped mid-request (proxy, Cloudflare, firewall). | Often transient — the client auto-retries. If persistent, check your reverse proxy / Cloudflare rules. |
| `ETIMEDOUT` / `TimeoutError` | qBittorrent didn't respond within `QBIT_REQUEST_TIMEOUT_MS`. | Increase `QBIT_REQUEST_TIMEOUT_MS` or fix the upstream. |
| `EAI_AGAIN` | Transient DNS failure. | Usually self-heals via retry; check the container's DNS. |
| _no `causeCode`, status 401/403_ | Bad credentials or qBittorrent's Web UI auth-bypass list is blocking the container's IP. | Verify `QBIT_USER` / `QBIT_PASSWORD`, or add the container subnet to "Bypass authentication for clients on" in qBittorrent settings. |
| _login rejected: `Fails.`_ | Credentials accepted by the endpoint but qBittorrent returned `Fails.` | Wrong username/password. |

**Merge / remux fails with `ENOENT` on the source files** — the container can't see the files at the paths qBittorrent reported. Make sure `TORRENTS_DIR` inside the container is the **same absolute path** qBittorrent uses for `save_path`.

**Output file appears but is unplayable** — the merge step uses `ffmpeg -c copy`, which only works when all input parts share the same codecs / parameters. If parts differ (e.g. one is 23.976 fps and another is 25), you'll need to re-encode manually.

---

## License

No license file is provided; treat this as an internal tool.
