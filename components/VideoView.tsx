"use client";

import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

export function VideoView({ track }: { track: Track }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  // Never mirrored: text on paper/screens must read the right way round.
  return <video ref={ref} autoPlay playsInline muted />;
}
