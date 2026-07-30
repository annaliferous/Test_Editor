// Sprite frames for each animation, loaded once at module init via Vite's
// glob import (previously re-globbed on every App render).
const loveFramesRaw = import.meta.glob("../assets/love/*.png", {
  eager: true,
  import: "default",
});
const joyFramesRaw = import.meta.glob("../assets/joy/*.png", {
  eager: true,
  import: "default",
});

function sortedFrames(rawGlob) {
  return Object.keys(rawGlob)
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map((k) => rawGlob[k]);
}

export const FRAMES = {
  love: sortedFrames(loveFramesRaw),
  joy: sortedFrames(joyFramesRaw),
};
