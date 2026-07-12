import { Redis } from "ioredis";
import { env } from "@/config/env";

export const redisConnection = new Redis({
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => console.log("[Redis] Connected"));
redisConnection.on("error", (err) => console.error("[Redis] Error:", err.message));
