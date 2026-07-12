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
  namingFunction: () => generateVideoId(),
  onUploadFinish: async (_req, res, upload) => {
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

router.all("/upload*", (req, res) => tusServer.handle(req, res));

export default router;
