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
    concurrency: 2,
  }
);

videoWorker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

videoWorker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err?.message || "unknown error");
});
