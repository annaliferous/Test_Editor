import { useState, useEffect } from "react";

// Cycles through a list of image frames on an interval, used to render the
// joy/love sprite animations on the animation buttons. `startIndex` lets
// several instances sharing the same frames/interval loop out of phase
// with each other (e.g. a stack of icons that stay offset from one
// another instead of all showing the same frame at once).
export default function FramePlayer({
  frames,
  intervalMs,
  className,
  alt,
  startIndex = 0,
}) {
  const [frameIndex, setFrameIndex] = useState(
    frames && frames.length > 0 ? startIndex % frames.length : 0,
  );

  useEffect(() => {
    if (!frames || frames.length === 0) return;
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [frames, intervalMs]);

  if (!frames || frames.length === 0) return null;
  return (
    <img
      src={frames[frameIndex]}
      alt={alt}
      className={className}
      draggable={false}
    />
  );
}
