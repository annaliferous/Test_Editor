import { useEffect, useRef, useState } from "react";
import PageThumbnail from "./PageThumbnail";
import { FRAMES } from "../utils/frames";
import { useCascadingBars } from "../hooks/useCascadingBars";

// "There's more below" hint: a stack of signal-strength icons that builds
// up from the bottom (sprite_3, weakest) to the top (sprite_0, strongest),
// one bar at a time, then disappears and starts over. How fast a new bar
// appears depends on scroll proximity to the bottom — quick while far from
// it, slow right before it.
const SIGNAL_FAST_INTERVAL = 120;
const SIGNAL_SLOW_INTERVAL = 900;

// Base delay (seconds) before the ripple reaches the active page's
// thumbnail — a continuation of the wave that starts in the main editor's
// text — and the step between each thumbnail further away from it. The
// wave radiates outward from the active page in both directions, so a
// page in the middle ripples up and down at once, while the top or bottom
// page ripples in a single direction (and keeps looping since the
// underlying CSS animation repeats forever).
const RIPPLE_PAGE_BASE_DELAY = 0.5;
const RIPPLE_PAGE_STEP = 0.45;

// Left sidebar: list of page thumbnails (reorderable by drag) plus the
// "add page" button.
export default function PagesRail({
  pages,
  currentPageId,
  draggingPageId,
  rewritingPageIds,
  rippleActive,
  barsActive,
  pendingDiffsByPage,
  loadingAnim,
  intensity,
  intensityToDuration,
  registerPageRef,
  dragMovedRef,
  onPageDragStart,
  onSwitchPage,
  onDeletePage,
  onAddPage,
}) {
  const activePageIdx = pages.findIndex((p) => p.id === currentPageId);
  const registerBarsCanvas = useCascadingBars(
    barsActive,
    pages.map((p) => p.id),
  );

  // "Scroll for more changes" hint: a looping signal-strength icon pinned
  // to the bottom of the rail after a global rewrite/refactor, so pages
  // the user hasn't scrolled to yet aren't missed. Loops fast while far
  // from the bottom, slows down while approaching it, and disappears once
  // there's nothing left to scroll to.
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({
    scrollable: false,
    atBottom: true,
    proximity: 0,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateScrollState() {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const scrollable = maxScroll > 1;
      const distanceFromBottom = Math.max(0, maxScroll - el.scrollTop);
      setScrollState({
        scrollable,
        atBottom: distanceFromBottom <= 2,
        proximity: scrollable
          ? Math.max(0, Math.min(1, distanceFromBottom / maxScroll))
          : 0,
      });
    }

    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [pages.length]);

  const hasGlobalPendingDiff =
    pendingDiffsByPage && Object.keys(pendingDiffsByPage).length > 1;
  const showScrollHint =
    hasGlobalPendingDiff && scrollState.scrollable && !scrollState.atBottom;
  const signalIntervalMs =
    SIGNAL_FAST_INTERVAL +
    (SIGNAL_SLOW_INTERVAL - SIGNAL_FAST_INTERVAL) * (1 - scrollState.proximity);

  // How many bars are currently visible, bottom-up: 1 = just sprite_3, up
  // to FRAMES.signal.length = the full stack. 0 is the brief blank beat
  // between one full build-up and the next starting over.
  const [stackCount, setStackCount] = useState(1);

  // signalIntervalMs changes on every scroll event (it tracks proximity to
  // the bottom), so it can't be a dependency of the ticking effect below —
  // that would tear down and restart the timer on every scroll tick and
  // the animation would never get a chance to actually fire while
  // scrolling. Keep the latest value in a ref instead, and read it fresh
  // each time the self-scheduling timeout below fires.
  const signalIntervalRef = useRef(signalIntervalMs);
  signalIntervalRef.current = signalIntervalMs;

  useEffect(() => {
    if (!showScrollHint) {
      setStackCount(1);
      return;
    }
    let timeoutId;
    function tick() {
      setStackCount((c) => (c >= FRAMES.signal.length ? 0 : c + 1));
      timeoutId = setTimeout(tick, signalIntervalRef.current);
    }
    timeoutId = setTimeout(tick, signalIntervalRef.current);
    return () => clearTimeout(timeoutId);
  }, [showScrollHint]);

  return (
    <aside className="pages-pane">
      <div className="pages-scroll" ref={scrollRef}>
        <div className="pages-list">
          {pages.map((page, idx) => (
            <PageThumbnail
              key={page.id}
              page={page}
              pageNumber={idx + 1}
              isActive={page.id === currentPageId}
              isDragging={draggingPageId === page.id}
              isRewriting={rewritingPageIds.has(page.id)}
              isRippling={rippleActive}
              rippleDelay={
                RIPPLE_PAGE_BASE_DELAY +
                Math.abs(idx - activePageIdx) * RIPPLE_PAGE_STEP
              }
              isBarsRippling={barsActive}
              registerBarsCanvas={registerBarsCanvas}
              pendingDiff={pendingDiffsByPage?.[page.id] ?? null}
              loadingAnim={loadingAnim}
              intensity={intensity}
              intensityToDuration={intensityToDuration}
              innerRef={(el) => registerPageRef(page.id, el)}
              onPointerDown={(e) => onPageDragStart(e, page)}
              onClick={(e) => {
                if (dragMovedRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                onSwitchPage(page.id);
              }}
              onDelete={() => onDeletePage(page.id)}
              canDelete={pages.length > 1}
            />
          ))}
        </div>
        <button
          className="btn btn-small btn-ghost add-page-btn"
          onClick={onAddPage}
        >
          + Add page
        </button>
      </div>
      {showScrollHint && (
        <div className="pages-scroll-hint" aria-hidden="true">
          {FRAMES.signal.map((src, idx) => {
            // idx 0 is sprite_0 (top, strongest); the last idx is sprite_3
            // (bottom, weakest) — it should be the first to reveal.
            const revealAt = FRAMES.signal.length - idx;
            return (
              <img
                key={idx}
                src={src}
                alt=""
                draggable={false}
                className="pages-scroll-hint-icon"
                style={{
                  visibility: stackCount >= revealAt ? "visible" : "hidden",
                }}
              />
            );
          })}
        </div>
      )}
    </aside>
  );
}
