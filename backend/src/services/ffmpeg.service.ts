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
        "-codec: copy",
        "-start_number 0",
        "-hls_time 6",
        "-hls_list_size 0",
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
