import { useState } from "react";
import UploadForm from "@/components/UploadForm";
import VideoPlayer from "@/components/VideoPlayer";

export default function App() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");

  const handleUploaded = (id: string) => {
    setVideoId(id);
    pollStatus(id);
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      const res = await fetch(`http://localhost:5000/api/status/${id}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status === "completed") clearInterval(interval);
    }, 2000);
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Video HLS Pipeline — Test</h1>
      <UploadForm onUploaded={handleUploaded} />
      {videoId && <p>videoId: {videoId} — trạng thái: {status}</p>}
      {status === "completed" && videoId && <VideoPlayer videoId={videoId} />}
    </div>
  );
}
