import { useEffect, useRef, useState } from "react";
import { globalOffset, trailShrinkFraction } from "../utils/trailScale";

const STEP_MS = 1000; // time spent settled at each stop before advancing
const PAGE_SWITCH_SETTLE_MS = 300; // let the new page render before measuring
const SCROLL_SETTLE_MS = 150; // let scrollIntoView finish before measuring
const FADE_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Renders one distance-based tool's single traveling marker — shared by
// the trail (shrinking pin) and time (filling stopwatch) tools, which
// differ only in how a distance fraction maps to a marker (sizeForFraction)
// and how that marker actually renders (renderMarker). Two sources feed
// it, never both showing at once:
//  - playRequestId (bumped by that tool's ▶ Play button): plays the
//    marker once through anchor → nearest-in-reading-order match → next →
//    ..., changing (and switching pages, for a global-scope search) as it
//    goes, then fades out.
//  - scrollMarker (reported live by EditorPane while nothing is playing):
//    a "you are here" marker snapped to whichever stop on the current
//    page sits closest to the middle of the visible text, updating as the
//    user scrolls.
// The travel sequence is driven by DOM queries/measurements (via
// anchorSelector/matchSelector) rather than component refs, since the
// stops it visits live inside whichever page EditorPane currently has
// mounted, which this component itself changes as it plays.
export default function DistanceMarkerAnimator({
  pendingRewrite,
  anchorSelector,
  matchSelector,
  pages,
  currentPageId,
  onSwitchPage,
  pageStartOffsets,
  totalDocLength,
  distanceMode,
  playRequestId,
  scrollMarker,
  sizeForFraction,
  renderMarker,
}) {
  const [marker, setMarker] = useState(null); // {x,y,size,opacity,fraction} | null, while playing
  const lastHandledPlayId = useRef(0);
  // Read via refs inside the async sequence instead of the effect's own
  // dependency array — the effect must only restart when playRequestId
  // itself changes (an explicit Play click), never merely because
  // onSwitchPage (or any other prop) got a new reference on some
  // unrelated App re-render, which would otherwise cancel a running
  // animation mid-flight.
  const latest = useRef({});
  latest.current = {
    pendingRewrite,
    pages,
    currentPageId,
    onSwitchPage,
    pageStartOffsets,
    totalDocLength,
    distanceMode,
  };

  useEffect(() => {
    if (!playRequestId || playRequestId === lastHandledPlayId.current) {
      return;
    }
    lastHandledPlayId.current = playRequestId;

    const { pendingRewrite, pages, pageStartOffsets, totalDocLength, distanceMode } =
      latest.current;
    if (!pendingRewrite) return;

    let cancelled = false;
    const anchor = pendingRewrite.anchor;

    // matchesByPage is a plain object, so Object.entries stringifies its
    // keys — but page ids are plain numbers (see utils/ids.js) and every
    // identity check below (===, the onSwitchPage argument, PagesRail's
    // own isActive checks) is a strict comparison that a stringified id
    // would silently fail. Map each key back to the real page id.
    const realPageId = {};
    pages.forEach((p) => {
      realPageId[String(p.id)] = p.id;
    });

    // Every match, tagged with its index within its own page's matches
    // array (already start-ascending — see locateIssues — so it lines up
    // with DOM order once that page is the one being shown), then sorted
    // into whole-document reading order for the journey.
    const matchStops = [];
    Object.entries(pendingRewrite.matchesByPage).forEach(([pageIdKey, matches]) => {
      const pageId = realPageId[pageIdKey] ?? pageIdKey;
      matches.forEach((m, indexInPage) => {
        matchStops.push({
          pageId,
          start: m.start,
          indexInPage,
          globalPos: globalOffset(pageStartOffsets, pageId, m.start),
        });
      });
    });
    matchStops.sort((a, b) => a.globalPos - b.globalPos);

    // No page filtering needed: a local-scope search only ever finds
    // matches on the anchor's own page in the first place, so the journey
    // naturally stays on one page there and crosses into others only when
    // the search itself was global (and so has something elsewhere to
    // visit) — the same Local/Global choice already made up front.
    const stops = [{ pageId: anchor.pageId, isAnchor: true }, ...matchStops];
    const anchorGlobalPos = globalOffset(pageStartOffsets, anchor.pageId, anchor.start);

    async function run() {
      let activePageId = latest.current.currentPageId;
      for (const stop of stops) {
        if (cancelled) return;
        if (stop.pageId !== activePageId) {
          latest.current.onSwitchPage(stop.pageId);
          activePageId = stop.pageId;
          await sleep(PAGE_SWITCH_SETTLE_MS);
          if (cancelled) return;
        }

        const el = stop.isAnchor
          ? document.querySelector(`.editor-pane ${anchorSelector}`)
          : document.querySelectorAll(`.editor-pane ${matchSelector}`)[stop.indexInPage];
        if (!el) continue; // resolved/removed mid-flight — skip to the next stop

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await sleep(SCROLL_SETTLE_MS);
        if (cancelled) return;

        const rect = el.getBoundingClientRect();
        const fraction = stop.isAnchor
          ? 0
          : trailShrinkFraction({
              anchorGlobalPos,
              matchGlobalPos: globalOffset(pageStartOffsets, stop.pageId, stop.start),
              totalDocLength,
              mode: distanceMode,
            });
        const size = sizeForFraction(fraction, stop.isAnchor);

        setMarker({
          x: rect.left + rect.width / 2,
          y: rect.top - size * 0.9,
          size,
          fraction,
          opacity: 1,
        });
        await sleep(STEP_MS);
      }
      if (cancelled) return;
      setMarker((prev) => (prev ? { ...prev, opacity: 0 } : prev));
      await sleep(FADE_MS);
      if (!cancelled) setMarker(null);
    }

    run();
    return () => {
      cancelled = true;
      // If Play gets clicked again (or the review gets edited/replaced)
      // mid-flight, the sequence above stops at its next `if (cancelled)
      // return` — without this it would leave the marker frozen on
      // screen forever, since nothing else would ever reach the
      // fade-out/setMarker(null) at the end of a normal run.
      setMarker(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequestId]);

  const shown = marker ?? scrollMarker;
  if (!shown) return null;
  return renderMarker(shown);
}
