import { Queue } from "bullmq";
import { redisConnection } from "@/queue/connection";

export const VIDEO_QUEUE_NAME = "video-processing";

export const videoQueue = new Queue(VIDEO_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export interface VideoJobData {
  videoId: string;
  inputPath: string;
}
