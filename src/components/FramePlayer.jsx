import { useState, useEffect } from "react";

// Cycles through a list of image frames on an interval, used to render the
// joy/love sprite animations on the animation buttons.
export default function FramePlayer({ frames, intervalMs, className, alt }) {
  const [frameIndex, setFrameIndex] = useState(0);

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
