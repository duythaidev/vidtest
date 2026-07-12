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
