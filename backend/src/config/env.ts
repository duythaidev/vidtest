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
