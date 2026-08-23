// Prefix-sum start offset (in a whole-document character ordering, pages
// concatenated in order) for every page, plus the document's total length —
// computed once per pages change and shared by every component that needs
// to size a "trail" pin by document distance.
export function computePageStartOffsets(pages) {
  const offsets = {};
  let running = 0;
  for (const page of pages) {
    offsets[page.id] = running;
    running += page.rawText.length;
  }
  return { pageStartOffsets: offsets, totalDocLength: running };
}

export function globalOffset(pageStartOffsets, pageId, charOffset) {
  return (pageStartOffsets[pageId] ?? 0) + charOffset;
}

// How far a pin has shrunk toward invisible, as a 0 (full size, right on
// the anchor) to 1 (fully shrunk) fraction of the distance between the
// anchor and the far edge of the whole document.
//   "forward": only mentions later in the document than the anchor shrink;
//     anything earlier stays full size.
//   "both": mentions shrink the farther they are from the anchor, either
//     direction through the document.
export function trailShrinkFraction({
  anchorGlobalPos,
  matchGlobalPos,
  totalDocLength,
  mode,
}) {
  if (mode === "forward") {
    const distance = Math.max(0, matchGlobalPos - anchorGlobalPos);
    const maxDistance = Math.max(1, totalDocLength - anchorGlobalPos);
    return Math.min(1, distance / maxDistance);
  }
  const distance = Math.abs(matchGlobalPos - anchorGlobalPos);
  const maxDistance = Math.max(
    1,
    anchorGlobalPos,
    totalDocLength - anchorGlobalPos,
  );
  return Math.min(1, distance / maxDistance);
}

// Trail-tool marker sizes (px) at editor scale — shared by EditorPane (the
// static per-word markers) and DistanceMarkerAnimator (the one-off traveling
// marker that visits them in sequence), so both agree on exactly how big
// each stop should be. The anchor is a fixed size distinctly bigger than
// any match can reach, even one right next to it (t≈0), so it always
// reads as the biggest regardless of document length.
export const TRAIL_ANCHOR_SIZE = 32;
export const TRAIL_MAX_SIZE = 24;
export const TRAIL_MIN_SIZE = 8;

export function trailSizePx(t) {
  return TRAIL_MAX_SIZE - t * (TRAIL_MAX_SIZE - TRAIL_MIN_SIZE);
}

// Time-tool marker: unlike the trail pin, its size never changes — only
// how "full" its stopwatch face is, via the same 0 (anchor, empty) to 1
// (max document distance, full) fraction trailShrinkFraction already
// produces. Shared by EditorPane/PageThumbnail (the static per-word
// stopwatches) and DistanceMarkerAnimator (the one-off traveling one).
export const TIME_ICON_SIZE = 20;
export const TIME_ICON_SIZE_THUMB = 11;
// The scroll-linked "you are here" stopwatch (see useDistanceScrollMarker)
// renders a bit bigger than the static per-word ones, so it reads clearly
// as the live indicator rather than blending in with them.
export const TIME_ICON_SIZE_SCROLL = 26;
