import { Router } from "express";
import express from "express";
import path from "path";
import { env } from "@/config/env";
import { videoQueue } from "@/queue/video.queue";

const router = Router();

router.use("/hls", express.static(path.resolve(env.hlsOutputDir)));

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
