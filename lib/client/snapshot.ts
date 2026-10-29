// Gemini bills images in 768px tiles (~258 tokens each); 1536px keeps print legible at ~4 tiles.
const MAX_EDGE = 1536;

/** Grab one full-resolution frame from a live video track as a JPEG data URL. */
export async function captureTrack(track: MediaStreamTrack, quality = 0.85): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  try {
    await video.play();
    if (!video.videoWidth) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Video frame timeout")), 4000);
        video.onloadeddata = () => {
          clearTimeout(t);
          resolve();
        };
      });
    }
    // Let one more frame render so we don't grab a black first frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return drawToJpeg(video, quality);
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

function drawToJpeg(video: HTMLVideoElement, quality: number): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("No video frame available");
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Shrink a JPEG so its long edge is at most `maxEdge` (no-op if already smaller). */
export async function shrinkDataUrl(dataUrl: string, maxEdge: number, quality = 0.85): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
