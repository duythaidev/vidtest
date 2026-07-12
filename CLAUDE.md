# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start everything (Redis + API + Worker + Frontend)
npm run dev

# Or start services individually:
docker compose up -d                    # Redis only
npm run dev:api --prefix backend        # Express API (port 5000)
npm run dev:worker --prefix backend     # BullMQ worker
npm run dev --prefix frontend           # Vite dev server (port 5173)
```

- Backend uses **nodemon** + **ts-node** — auto-restarts on file changes.
- No test runner configured.
- No linting/formatter configured.

## Architecture Overview

Monorepo with 3 workspaces (root orchestrates via `concurrently`):

### Data Flow

```
User selects file → tus chunked upload (tus-js-client → @tus/server)
                  → onUploadFinish pushes BullMQ job
                  → Worker processes with ffmpeg → HLS segments
                  → Frontend polls /api/status/:videoId → hls.js playback
```

### Backend (`backend/`)

Two **separate entry points** — like production where API and Worker scale independently:

| File | Purpose |
|---|---|
| `src/server.ts` | Express app — CORS, routes, serves HLS static files |
| `src/worker.ts` | BullMQ worker — imports the worker and starts listening |
| `src/api/upload.route.ts` | tus upload endpoint (`/api/upload*`), pushes job on finish |
| `src/api/video.route.ts` | Job status (`/api/status/:videoId`), serves HLS (`/api/hls/`) |
| `src/queue/video.queue.ts` | BullMQ queue definition (`video-processing`) |
| `src/workers/video.worker.ts` | Consumes queue — calls ffmpeg to transcode |
| `src/services/ffmpeg.service.ts` | fluent-ffmpeg wrapper — stream copy, 6s segments |
| `src/services/video.service.ts` | UUID generation, path helpers |
| `src/queue/connection.ts` | ioredis singleton (shared between queue + worker) |
| `src/config/env.ts` | Env vars from `.env` with defaults |

### Frontend (`frontend/`)

React 18 + Vite + hls.js. Single-page test UI.

| File | Purpose |
|---|---|
| `src/App.tsx` | Root — polls status, shows upload form or player |
| `src/components/UploadForm.tsx` | File input → triggers tus upload |
| `src/components/VideoPlayer.tsx` | hls.js video player |
| `src/hooks/useTusUpload.ts` | tus-js-client hook (5MB chunks, retry delays) |

### Key Technical Choices

- **Upload**: `@tus/server` + `tus-js-client` (resumable chunked upload protocol) rather than hand-rolled multipart — handles retry, ordering, resume on network loss.
- **Queue**: BullMQ over Redis — API pushes jobs, worker processes them asynchronously.
- **Transcoding**: fluent-ffmpeg with stream copy (no re-encode) and 6-second HLS segments.
- **Path aliases**: Backend uses `@/` → `src/` via `tsconfig-paths`.

## Configuration

Backend reads from `backend/.env`:

```
PORT=5000
NODE_ENV=development
REDIS_HOST=localhost
REDIS_PORT=6379
UPLOAD_DIR=./uploads
HLS_OUTPUT_DIR=./hls-output
PUBLIC_HLS_BASE_URL=http://localhost:5000/hls
```

## Prerequisites

- Node.js 18+, FFmpeg 5+, Docker Desktop (for Redis)
