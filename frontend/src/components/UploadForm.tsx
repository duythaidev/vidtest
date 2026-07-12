import { useTusUpload } from "@/hooks/useTusUpload";

interface Props {
  onUploaded: (videoId: string) => void;
}

export default function UploadForm({ onUploaded }: Props) {
  const { progress, videoId, isUploading, error, upload } = useTusUpload();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  };

  if (videoId && !isUploading) {
    onUploaded(videoId);
  }

  return (
    <div>
      <input type="file" accept="video/*" onChange={handleFileChange} disabled={isUploading} />
      {isUploading && <p>Đang upload: {progress}%</p>}
      {error && <p style={{ color: "red" }}>Lỗi: {error}</p>}
    </div>
  );
}
