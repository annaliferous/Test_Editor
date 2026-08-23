import { useLayoutEffect } from "react";
import { globalOffset, trailShrinkFraction } from "../utils/trailScale";

// Shared by the trail and time tools: while their travel animation isn't
// playing, a "you are here" marker instead snaps to whichever pinned word
// (anchor or match) on the CURRENT page sits closest to the middle of the
// visible diff area, live as the user scrolls. `sizeForFraction(t,
// isAnchor)` lets each tool decide what its own marker should look like
// at a given distance fraction — the trail pin shrinks, the time
// stopwatch stays a constant size (only its fill changes) — without this
// hook needing to know which.
export function useDistanceScrollMarker({
  active,
  pendingRewrite,
  diffContainerRef,
  anchorRef,
  markRefs,
  anchorOnThisPage,
  currentPageId,
  pageMatches,
  pageStartOffsets,
  totalDocLength,
  distanceMode,
  sizeForFraction,
  onScrollMarker,
}) {
  useLayoutEffect(() => {
    if (!active || !pendingRewrite) {
      onScrollMarker(null);
      return;
    }
    const container = diffContainerRef.current;
    if (!container) return;
    const anchor = pendingRewrite.anchor;
    const anchorGlobalPos = globalOffset(pageStartOffsets, anchor.pageId, anchor.start);

    function recompute() {
      const containerRect = container.getBoundingClientRect();
      const containerMidY = (containerRect.top + containerRect.bottom) / 2;
      let best = null;
      let bestDist = Infinity;

      function consider(rect, size, fraction) {
        if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
          return; // not even partially visible — nothing to snap to here
        }
        const midY = (rect.top + rect.bottom) / 2;
        const dist = Math.abs(midY - containerMidY);
        if (dist < bestDist) {
          bestDist = dist;
          best = {
            x: rect.left + rect.width / 2,
            y: rect.top - size * 0.9,
            size,
            fraction,
          };
        }
      }

      if (anchorOnThisPage && anchorRef.current) {
        consider(anchorRef.current.getBoundingClientRect(), sizeForFraction(0, true), 0);
      }
      markRefs.current.forEach((el, matchIndex) => {
        const match = pageMatches[matchIndex];
        if (!match) return;
        const t = trailShrinkFraction({
          anchorGlobalPos,
          matchGlobalPos: globalOffset(pageStartOffsets, currentPageId, match.start),
          totalDocLength,
          mode: distanceMode,
        });
        consider(el.getBoundingClientRect(), sizeForFraction(t, false), t);
      });

      onScrollMarker(best);
    }

    recompute();
    container.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      container.removeEventListener("scroll", recompute);
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [
    active,
    pendingRewrite,
    currentPageId,
    anchorOnThisPage,
    pageMatches,
    pageStartOffsets,
    totalDocLength,
    distanceMode,
    sizeForFraction,
    onScrollMarker,
  ]);
}
