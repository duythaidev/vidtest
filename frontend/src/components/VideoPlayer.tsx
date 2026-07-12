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
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
    }
  }, [src]);

  return <video ref={videoRef} controls style={{ width: "100%", maxWidth: 720 }} />;
}
