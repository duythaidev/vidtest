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
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 5 * 1024 * 1024,
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
