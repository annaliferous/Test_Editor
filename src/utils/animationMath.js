// Pure helpers mapping a 0-100 "intensity" slider value onto the various
// units each animation/effect needs (CSS duration, frame interval, prompt
// wording for the Ollama rewrite request).

export function intensityToDuration(value, minSec, maxSec) {
  const t = value / 100;
  return (maxSec - t * (maxSec - minSec)).toFixed(2);
}

export function intensityToFrameInterval(value, minMs, maxMs) {
  const t = value / 100;
  return Math.round(maxMs - t * (maxMs - minMs));
}

export function intensityToDescriptor(value) {
  if (value < 20) return "very subtly, barely noticeable";
  if (value < 40) return "mildly";
  if (value < 60) return "moderately";
  if (value < 80) return "strongly";
  return "extremely intensely, unmistakably";
}
