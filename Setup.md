# Video Upload → HLS Processing Pipeline — Setup Guide

Stack: React + TS (Vite) · Express + TS · Chunked/Resumable Upload (tus) · BullMQ + Redis · fluent-ffmpeg · hls.js
Chạy local: Docker Compose (Redis) + `npm run dev` (concurrently chạy API + Worker song song, log tách biệt).

---

## 0. Yêu cầu hệ thống

| Công cụ | Version tối thiểu | Kiểm tra |
|---|---|---|
| Node.js | 18.x LTS trở lên | `node -v` |
| npm | 9.x trở lên | `npm -v` |
| Docker Desktop | mới nhất (bật WSL2 backend trên Windows) | `docker -v` |
| FFmpeg | 5.x trở lên | `ffmpeg -version` |
| Git | bất kỳ | `git --version` |

### Cài FFmpeg trên Windows
```powershell
winget install --id Gyan.FFmpeg
```
Sau khi cài, mở lại terminal, kiểm tra:
```powershell
ffmpeg -version
```
Nếu lệnh không nhận, thêm thủ công đường dẫn `ffmpeg\bin` vào biến môi trường `PATH`, rồi mở lại VS Code/terminal.

---

## 1. Cấu trúc thư mục dự án

```
/video-hls-pipeline
├── frontend/                      # React TSX (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadForm.tsx
│   │   │   └── VideoPlayer.tsx
│   │   ├── hooks/
│   │   │   └── useTusUpload.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── upload.route.ts    # endpoint tus upload
│   │   │   ├── video.route.ts     # get status, list video, serve HLS
│   │   │   └── index.ts
│   │   ├── workers/
│   │   │   └── video.worker.ts    # BullMQ worker (entry point riêng)
│   │   ├── services/
│   │   │   ├── ffmpeg.service.ts
│   │   │   └── video.service.ts
│   │   ├── queue/
│   │   │   ├── connection.ts      # ioredis connection dùng chung
│   │   │   └── video.queue.ts
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── server.ts              # entry point API (KHÔNG start worker ở đây)
│   │   └── worker.ts              # entry point worker (import từ workers/)
│   ├── uploads/                   # file gốc sau khi ghép chunk xong (gitignore)
│   ├── hls-output/                # HLS segments + m3u8 (gitignore)
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── nodemon.json
│
├── docker-compose.yml             # Redis only cho local dev
├── package.json                   # root: chạy concurrently frontend+backend api+worker
├── .gitignore
└── README.md
```

**Lý do tách `server.ts` và `worker.ts` làm 2 entry point riêng dù cùng repo:**
Giống kiến trúc production (API và Worker scale độc lập), nhưng vẫn chạy chung 1 lệnh `npm run dev` ở local nhờ `concurrently`. Sau này deploy, chỉ cần chạy 2 container/process khác nhau trỏ vào 2 file build khác nhau, không phải sửa code.

---

## 2. Setup Redis bằng Docker Compose

### `docker-compose.yml` (đặt ở root)
```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    container_name: video-pipeline-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

volumes:
  redis-data:
```

### Chạy Redis
```powershell
docker compose up -d
docker compose ps        # kiểm tra container đang chạy
docker compose logs -f redis   # xem log nếu cần
```

Dừng: `docker compose down`
Xoá luôn data: `docker compose down -v`

> Không cần cài Redis trên Windows — mọi kết nối từ Node.js trỏ `localhost:6379` là đủ vì Docker đã map port ra host.

---

## 3. Setup Backend

### 3.1. Khởi tạo
```powershell
mkdir backend
cd backend
npm init -y
```

### 3.2. Cài dependencies
```powershell
npm install express cors dotenv ioredis bullmq fluent-ffmpeg @tus/server @tus/file-store uuid
npm install -D typescript ts-node nodemon @types/node @types/express @types/cors @types/fluent-ffmpeg @types/uuid
```

**Giải thích lựa chọn thư viện upload:**
Bạn đã chọn **chunked/resumable upload ngay từ đầu**, nên dùng `@tus/server` (chuẩn tus.io — resumable upload protocol phổ biến nhất, có client chính thức cho React) thay vì tự viết logic ghép chunk bằng Multer. Việc tự ghép chunk thủ công dễ lỗi (thứ tự chunk, retry, resume khi mất mạng) — tus xử lý sẵn toàn bộ.

### 3.3. `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.4. `.env.example` (copy thành `.env`)
```env
PORT=5000
NODE_ENV=development

REDIS_HOST=localhost
REDIS_PORT=6379

UPLOAD_DIR=./uploads
HLS_OUTPUT_DIR=./hls-output

# Base URL frontend dùng để load .m3u8
PUBLIC_HLS_BASE_URL=http://localhost:5000/hls
```

### 3.5. `src/config/env.ts`
```ts
import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: Number(process.env.REDIS_PORT) || 6379,
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  hlsOutputDir: process.env.HLS_OUTPUT_DIR || "./hls-output",
  publicHlsBaseUrl: process.env.PUBLIC_HLS_BASE_URL || "http://localhost:5000/hls",
};
```

### 3.6. `src/queue/connection.ts`
```ts
import { Redis } from "ioredis";
import { env } from "@/config/env";

// maxRetriesPerRequest: null là BẮT BUỘC với BullMQ, nếu không sẽ warning/lỗi khi block command
export const redisConnection = new Redis({
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => console.log("[Redis] Connected"));
redisConnection.on("error", (err) => console.error("[Redis] Error:", err.message));
```

### 3.7. `src/queue/video.queue.ts`
```ts
import { Queue } from "bullmq";
import { redisConnection } from "@/queue/connection";

export const VIDEO_QUEUE_NAME = "video-processing";

export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,   // giữ 50 job gần nhất để debug
    removeOnFail: 100,
  },
});

export interface VideoJobData {
  videoId: string;
  inputPath: string;
}
```

### 3.8. `src/services/ffmpeg.service.ts`
```ts
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

export function convertToHLS(inputPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, "index.m3u8");

    ffmpeg(inputPath)
      .outputOptions([
        "-codec: copy",       // copy stream, không re-encode -> nhanh cho test
        "-start_number 0",
        "-hls_time 6",         // mỗi segment 6s
        "-hls_list_size 0",    // giữ toàn bộ segment trong playlist (VOD)
        "-f hls",
      ])
      .output(outputPath)
      .on("start", (cmd) => console.log("[FFmpeg] Start:", cmd))
      .on("progress", (progress) => {
        console.log(`[FFmpeg] Processing: ${progress.timemark || ""}`);
      })
      .on("end", () => {
        console.log("[FFmpeg] Done:", outputPath);
        resolve();
      })
      .on("error", (err) => {
        console.error("[FFmpeg] Error:", err.message);
        reject(err);
      })
      .run();
  });
}
```

> Lưu ý: `-codec copy` chỉ hoạt động tốt nếu video input đã là H.264/AAC (phổ biến với mp4 quay từ điện thoại/export từ Premiere...). Nếu input là codec lạ (vd. video từ webcam ghi bằng codec VP8), copy sẽ lỗi hoặc HLS không phát được — lúc đó cần đổi sang re-encode (`-c:v libx264 -c:a aac`), chậm hơn nhưng an toàn hơn. Để test nhanh ban đầu, cứ dùng `-codec copy` trước.

### 3.9. `src/services/video.service.ts`
```ts
import { v4 as uuid } from "uuid";
import path from "path";
import { env } from "@/config/env";

export function generateVideoId(): string {
  return uuid();
}

export function getHlsOutputPath(videoId: string): string {
  return path.join(env.hlsOutputDir, videoId);
}

export function getPublicHlsUrl(videoId: string): string {
  return `${env.publicHlsBaseUrl}/${videoId}/index.m3u8`;
}
```

### 3.10. `src/api/upload.route.ts` (tus resumable upload)
```ts
import { Router } from "express";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import path from "path";
import { env } from "@/config/env";
import { videoQueue } from "@/queue/video.queue";
import { generateVideoId } from "@/services/video.service";

const router = Router();

const tusServer = new Server({
  path: "/api/upload",
  datastore: new FileStore({ directory: path.resolve(env.uploadDir) }),
  namingFunction: () => generateVideoId(), // videoId = tên file luôn, dùng lại xuyên suốt pipeline
  onUploadFinish: async (req, res, upload) => {
    const videoId = upload.id;
    const inputPath = path.join(path.resolve(env.uploadDir), videoId);

    console.log(`[Upload] Finished: ${videoId}`);

    await videoQueue.add("process-video", {
      videoId,
      inputPath,
    });

    console.log(`[Queue] Job pushed for videoId: ${videoId}`);
    return res;
  },
});

// tus cần handle mọi method (POST/PATCH/HEAD/OPTIONS/DELETE) trên cùng path
router.all("/upload*", (req, res) => tusServer.handle(req, res));

export default router;
```

### 3.11. `src/api/video.route.ts`
```ts
import { Router } from "express";
import express from "express";
import path from "path";
import { env } from "@/config/env";
import { videoQueue } from "@/queue/video.queue";

const router = Router();

// Serve HLS segments + m3u8 tĩnh
router.use("/hls", express.static(path.resolve(env.hlsOutputDir)));

// Check trạng thái xử lý video (để frontend poll)
router.get("/status/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const jobs = await videoQueue.getJobs(["completed", "active", "waiting", "failed"]);
  const job = jobs.find((j) => j.data.videoId === videoId);

  if (!job) {
    return res.status(404).json({ status: "not_found" });
  }

  const state = await job.getState();
  return res.json({ status: state });
});

export default router;
```

### 3.12. `src/api/index.ts`
```ts
import { Router } from "express";
import uploadRoute from "@/api/upload.route";
import videoRoute from "@/api/video.route";

const router = Router();

router.use(uploadRoute);
router.use(videoRoute);

export default router;
```

### 3.13. `src/server.ts` (entry point API — KHÔNG chứa worker)
```ts
import express from "express";
import cors from "cors";
import { env } from "@/config/env";
import apiRouter from "@/api/index";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(env.port, () => {
  console.log(`[API] Server running at http://localhost:${env.port}`);
});
```

### 3.14. `src/workers/video.worker.ts`
```ts
import { Worker, Job } from "bullmq";
import { redisConnection } from "@/queue/connection";
import { VIDEO_QUEUE_NAME, VideoJobData } from "@/queue/video.queue";
import { convertToHLS } from "@/services/ffmpeg.service";
import { getHlsOutputPath } from "@/services/video.service";

export const videoWorker = new Worker<VideoJobData>(
  VIDEO_QUEUE_NAME,
  async (job: Job<VideoJobData>) => {
    const { videoId, inputPath } = job.data;
    console.log(`[Worker] Start processing videoId=${videoId}`);

    const outputDir = getHlsOutputPath(videoId);
    await convertToHLS(inputPath, outputDir);

    console.log(`[Worker] Finished videoId=${videoId}`);
    return { videoId, outputDir };
  },
  {
    connection: redisConnection,
    concurrency: 2, // xử lý tối đa 2 video cùng lúc, tăng dần khi máy khoẻ hơn
  }
);

videoWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

videoWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});
```

### 3.15. `src/worker.ts` (entry point Worker — process riêng)
```ts
import "@/workers/video.worker";

console.log("[Worker] Process started, listening for jobs...");
```

### 3.16. `nodemon.json` (dùng chung, chạy 2 lần với entry khác nhau)
```json
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node -r tsconfig-paths/register"
}
```

Cần thêm 1 package hỗ trợ alias `@/`:
```powershell
npm install -D tsconfig-paths
```

### 3.17. `backend/package.json` — scripts
```json
{
  "scripts": {
    "dev:api": "nodemon --config nodemon.json src/server.ts",
    "dev:worker": "nodemon --config nodemon.json src/worker.ts",
    "build": "tsc",
    "start:api": "node -r tsconfig-paths/register dist/server.js",
    "start:worker": "node -r tsconfig-paths/register dist/worker.js"
  }
}
```

---

## 4. Setup Frontend

### 4.1. Khởi tạo
```powershell
cd ..
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

### 4.2. Cài dependencies
```powershell
npm install hls.js tus-js-client
npm install -D @types/hls.js
```

### 4.3. `src/hooks/useTusUpload.ts`
```ts
import { useState, useCallback } from "react";
import * as tus from "tus-js-client";

interface UseTusUploadResult {
  progress: number;
  videoId: string | null;
  isUploading: boolean;
  error: string | null;
  upload: (file: File) => void;
}

const UPLOAD_ENDPOINT = "http://localhost:5000/api/upload";

export function useTusUpload(): UseTusUploadResult {
  const [progress, setProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback((file: File) => {
    setIsUploading(true);
    setError(null);

    const tusUpload = new tus.Upload(file, {
      endpoint: UPLOAD_ENDPOINT,
      retryDelays: [0, 1000, 3000, 5000], // tự retry khi mất mạng — đây là điểm mạnh của resumable upload
      chunkSize: 5 * 1024 * 1024, // 5MB / chunk
      metadata: {
        filename: file.name,
        filetype: file.type,
      },
      onError: (err) => {
        console.error("[Upload] Error:", err);
        setError(err.message);
        setIsUploading(false);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        const uploadUrl = tusUpload.url || "";
        const id = uploadUrl.split("/").pop() || null;
        setVideoId(id);
        setIsUploading(false);
        console.log("[Upload] Success, videoId:", id);
      },
    });

    tusUpload.start();
  }, []);

  return { progress, videoId, isUploading, error, upload };
}
```

### 4.4. `src/components/UploadForm.tsx`
```tsx
import { useTusUpload } from "@/hooks/useTusUpload";

interface Props {
  onUploaded: (videoId: string) => void;
}

export default function UploadForm({ onUploaded }: Props) {
  const { progress, videoId, isUploading, error, upload } = useTusUpload();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  if (videoId && !isUploading) {
    onUploaded(videoId);
  }

  return (
    <div>
      <input type="file" accept="video/*" onChange={handleFileChange} disabled={isUploading} />
      {isUploading && <p>Đang upload: {progress}%</p>}
      {error && <p style={{ color: "red" }}>Lỗi: {error}</p>}
    </div>
  );
}
```

### 4.5. `src/components/VideoPlayer.tsx`
```tsx
import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface Props {
  videoId: string;
}

export default function VideoPlayer({ videoId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `http://localhost:5000/hls/${videoId}/index.m3u8`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari hỗ trợ HLS native
      video.src = src;
    }
  }, [src]);

  return <video ref={videoRef} controls style={{ width: "100%", maxWidth: 720 }} />;
}
```

### 4.6. `src/App.tsx`
```tsx
import { useState } from "react";
import UploadForm from "@/components/UploadForm";
import VideoPlayer from "@/components/VideoPlayer";

export default function App() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");

  const handleUploaded = (id: string) => {
    setVideoId(id);
    pollStatus(id);
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      const res = await fetch(`http://localhost:5000/api/status/${id}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status === "completed") clearInterval(interval);
    }, 2000);
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Video HLS Pipeline — Test</h1>
      <UploadForm onUploaded={handleUploaded} />
      {videoId && <p>videoId: {videoId} — trạng thái: {status}</p>}
      {status === "completed" && videoId && <VideoPlayer videoId={videoId} />}
    </div>
  );
}
```

Cần thêm alias `@/` cho Vite:

`vite.config.ts`
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

`tsconfig.json` (frontend) — thêm vào `compilerOptions`:
```json
"baseUrl": "./src",
"paths": { "@/*": ["*"] }
```

---

## 5. Root: chạy tất cả bằng 1 lệnh `npm run dev`

### 5.1. Cài concurrently ở root
```powershell
cd ..   # về video-hls-pipeline/
npm init -y
npm install -D concurrently
```

### 5.2. Root `package.json`
```json
{
  "name": "video-hls-pipeline",
  "private": true,
  "scripts": {
    "dev": "concurrently -n REDIS,API,WORKER,WEB -c blue,green,yellow,magenta \"docker compose up\" \"npm run dev:api --prefix backend\" \"npm run dev:worker --prefix backend\" \"npm run dev --prefix frontend\""
  }
}
```

> `-n` đặt tên nhãn cho từng log, `-c` gán màu — giúp phân biệt log Redis/API/Worker/Frontend ngay trong 1 terminal, đúng tinh thần "test local dùng npm run dev" nhưng vẫn giữ API và Worker là 2 process độc lập như production.

Chạy:
```powershell
npm run dev
```

Nếu muốn Redis chạy nền sẵn (không muốn thấy log Redis mỗi lần), có thể tách:
```powershell
docker compose up -d      # chạy 1 lần, để nền
```
rồi rút gọn script `dev` chỉ còn API + WORKER + WEB.

---

## 6. `.gitignore` (root)
```
node_modules/
dist/
backend/uploads/
backend/hls-output/
.env
*.log
```

---

## 7. Checklist test end-to-end

1. `docker compose up -d` → kiểm tra `docker compose ps` thấy Redis đang `running`.
2. Copy `backend/.env.example` → `backend/.env`.
3. `npm run dev` ở root.
4. Mở `http://localhost:5173` (Vite mặc định).
5. Chọn 1 file video nhỏ (< 100MB, định dạng mp4 H.264 để test `-codec copy` mượt).
6. Theo dõi:
   - Log `[Upload] Finished` + `[Queue] Job pushed` ở terminal API.
   - Log `[Worker] Start processing` → `[FFmpeg] Start` → `[FFmpeg] Done` ở terminal Worker.
7. Kiểm tra thư mục `backend/hls-output/<videoId>/` xuất hiện `index.m3u8` + các file `.ts`.
8. Frontend tự poll status, khi `completed` → video player load và phát được.

---

## 8. Việc cần làm tiếp theo (ngoài phạm vi bản test này)

- Xử lý lỗi khi input không phải H.264/AAC (fallback sang re-encode).
- Multi-quality HLS (khi cần, dùng `-var_stream_map` của ffmpeg tạo master playlist).
- Dọn file gốc trong `uploads/` sau khi convert xong.
- Retry/backoff hiện đã có ở queue nhưng cần thêm dashboard theo d
