import { useLayoutEffect, useRef, useState } from "react";
import { buildLocationSegments } from "../utils/textHighlight";
import {
  globalOffset,
  trailShrinkFraction,
  trailSizePx,
  TRAIL_ANCHOR_SIZE,
  TIME_ICON_SIZE,
  TIME_ICON_SIZE_SCROLL,
} from "../utils/trailScale";
import { useDistanceScrollMarker } from "../hooks/useDistanceScrollMarker";
import HaloRing from "./HaloRing";

// Maps a raw pixel distance (how far off-screen a location match is) to the
// "distance" HaloRing scales its ring radius from. Square-root compression
// so the ring keeps visibly shrinking across the whole scroll range instead
// of just the last handful of pixels before the target comes into view.
function scaleInPageDistance(px) {
  return Math.sqrt(Math.max(px, 0)) * 3;
}

// How far above a pinned word's own box the 📌 visually sits — used both
// by the CSS (::before offset) and here in JS to report a matching point
// for the cross-page connecting line to aim at. Pin-tool only.
const PIN_VERTICAL_OFFSET = 14;

// How long the match popover stays up after the mouse leaves a pinned
// word, so there's time to move the pointer into it to click a button.
const POPOVER_HIDE_DELAY = 150;

const anchorTrailStyle = {
  "--trail-size": `${TRAIL_ANCHOR_SIZE}px`,
  "--trail-opacity": 1,
};

function trailPinStyle(t) {
  return {
    "--trail-size": `${trailSizePx(t)}px`,
    "--trail-opacity": Math.max(0, 1 - t),
  };
}

// Time tool: the stopwatch never changes size — only how full its face is,
// via the same 0 (anchor, empty) to 1 (max document distance, full)
// fraction the trail tool uses for size.
function timeIconStyle(t) {
  return {
    "--time-size": `${TIME_ICON_SIZE}px`,
    "--time-fill": t,
  };
}
const anchorTimeStyle = timeIconStyle(0);

const trailSizeForFraction = (t, isAnchor) => (isAnchor ? TRAIL_ANCHOR_SIZE : trailSizePx(t));
// The scroll-linked stopwatch renders a bit bigger than the static
// per-word ones, so it reads clearly as the live "you are here" marker.
const timeScrollSizeForFraction = () => TIME_ICON_SIZE_SCROLL;

// Center panel. Shows one of two things for the current page:
//  - a pending location rewrite (pin, trail, or time tool): the anchor
//    word (directly editable, marker above it) plus every other passage
//    on this page that also refers to the same thing (each marked too,
//    hover for Accept/Dismiss)
//  - a plain textarea, for free-text editing
export default function EditorPane({
  currentPageId,
  currentPage,
  onChangeText,
  selection,
  onSelectionChange,
  armedKind,
  onCancelRewrite,
  pendingRewrite,
  rewriteLoading,
  rewriteError,
  onRequestRewrite,
  onAcceptMatch,
  onDismissMatch,
  onRenameAnchor,
  onAcceptAllRewrite,
  onDismissAllRewrite,
  haloCuesEnabled,
  onReportPins,
  pageStartOffsets,
  totalDocLength,
  trailDistanceMode,
  onTrailScrollMarker,
  onPlayTrailAnimation,
  timeDistanceMode,
  onTimeScrollMarker,
  onPlayTimeAnimation,
}) {
  const editorPaneRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);
  const [hoverMatch, setHoverMatch] = useState(null);
  const hoverHideTimeout = useRef(null);

  // Position the "find other mentions" popup near wherever the selection
  // was made: the mouse-up point for a drag-selection, or near the
  // textarea for a keyboard-driven one (shift+arrow, ctrl+a, ...).
  function positionPopup(e) {
    if (!armedKind) return;
    const { selectionStart, selectionEnd } = e.target;
    if (selectionStart === selectionEnd) {
      onSelectionChange(null);
      setPopupPos(null);
      return;
    }
    onSelectionChange({
      start: selectionStart,
      end: selectionEnd,
      text: currentPage.rawText.slice(selectionStart, selectionEnd),
    });

    const containerRect = editorPaneRef.current.getBoundingClientRect();
    let left, top;
    if (typeof e.clientX === "number") {
      left = e.clientX - containerRect.left;
      top = e.clientY - containerRect.top;
    } else {
      const textareaRect = e.target.getBoundingClientRect();
      left = textareaRect.left - containerRect.left + 24;
      top = textareaRect.top - containerRect.top + 24;
    }
    // The popup renders above the point by default; flip below when there
    // isn't enough headroom, so it doesn't get clipped by the pane's
    // overflow: hidden near the top edge.
    const POPUP_CLEARANCE = 70;
    setPopupPos({
      left: Math.min(Math.max(left, 20), containerRect.width - 20),
      top: Math.max(top, 10),
      placeAbove: top > POPUP_CLEARANCE,
    });
  }

  function showMatchPopover(e, matchIndex) {
    if (hoverHideTimeout.current) {
      clearTimeout(hoverHideTimeout.current);
      hoverHideTimeout.current = null;
    }
    const containerRect = editorPaneRef.current.getBoundingClientRect();
    const markRect = e.target.getBoundingClientRect();
    const left = markRect.left + markRect.width / 2 - containerRect.left;
    const top = markRect.top - containerRect.top;
    const POPUP_CLEARANCE = 70;
    setHoverMatch({
      index: matchIndex,
      left: Math.min(Math.max(left, 20), containerRect.width - 20),
      top: Math.max(top, 10),
      placeAbove: top > POPUP_CLEARANCE,
    });
  }

  function scheduleHidePopover() {
    hoverHideTimeout.current = setTimeout(
      () => setHoverMatch(null),
      POPOVER_HIDE_DELAY,
    );
  }

  function cancelHidePopover() {
    if (hoverHideTimeout.current) {
      clearTimeout(hoverHideTimeout.current);
      hoverHideTimeout.current = null;
    }
  }

  const showPopup =
    armedKind && selection && popupPos && !pendingRewrite && !rewriteLoading;

  const anchor = pendingRewrite?.anchor;
  const anchorOnThisPage = anchor?.pageId === currentPageId;
  const pageMatches = pendingRewrite?.matchesByPage[currentPageId] || [];
  const isTrail = pendingRewrite?.kind === "trail";
  const isTime = pendingRewrite?.kind === "time";

  const segments = buildLocationSegments(
    currentPage.rawText,
    currentPageId,
    anchor,
    pageMatches,
  );

  function distanceStyleFor(span) {
    const anchorGlobalPos = globalOffset(
      pageStartOffsets,
      anchor.pageId,
      anchor.start,
    );
    const matchGlobalPos = globalOffset(
      pageStartOffsets,
      currentPageId,
      span.start,
    );
    const mode = isTime ? timeDistanceMode : trailDistanceMode;
    const t = span.isAnchor
      ? 0
      : trailShrinkFraction({ anchorGlobalPos, matchGlobalPos, totalDocLength, mode });
    return isTime ? timeIconStyle(t) : span.isAnchor ? anchorTrailStyle : trailPinStyle(t);
  }

  // ---- Off-screen edge cues + on-screen pin position reporting ----
  // Pin-tool only: matches (and the anchor, if on this page) scrolled out
  // of the diff container get an edge-cue ring, and everything still
  // visible has its screen position reported upward so the app-level
  // connecting line can be drawn straight to it. The trail and time tools
  // communicate distance by marker appearance alone, so none of this
  // applies to them — refs still get attached below, they're just never
  // read for that purpose.
  const diffContainerRef = useRef(null);
  const markRefs = useRef(new Map()); // matchIndex -> el
  const anchorRef = useRef(null);
  const [inPageCues, setInPageCues] = useState({
    up: 0,
    down: 0,
    upDist: 0,
    downDist: 0,
    upX: 0,
    downX: 0,
    nearestUpEl: null,
    nearestDownEl: null,
  });

  function registerMarkRef(matchIndex, el) {
    if (el) markRefs.current.set(matchIndex, el);
    else markRefs.current.delete(matchIndex);
  }

  useLayoutEffect(() => {
    if (!pendingRewrite || pendingRewrite.kind !== "pin") {
      setInPageCues({
        up: 0,
        down: 0,
        upDist: 0,
        downDist: 0,
        upX: 0,
        downX: 0,
        nearestUpEl: null,
        nearestDownEl: null,
      });
      onReportPins({});
      return;
    }
    const container = diffContainerRef.current;
    const paneEl = editorPaneRef.current;
    if (!container || !paneEl) return;

    function pinPoint(rect) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top - PIN_VERTICAL_OFFSET,
      };
    }

    function recompute() {
      const containerRect = container.getBoundingClientRect();
      const paneRect = paneEl.getBoundingClientRect();
      let up = 0;
      let down = 0;
      let nearestUpEl = null;
      let nearestUpDist = Infinity;
      let nearestDownEl = null;
      let nearestDownDist = Infinity;
      const pins = {};

      if (anchorOnThisPage && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        if (rect.bottom < containerRect.top) {
          up += 1;
          const dist = containerRect.top - rect.bottom;
          if (dist < nearestUpDist) {
            nearestUpDist = dist;
            nearestUpEl = anchorRef.current;
          }
        } else if (rect.top > containerRect.bottom) {
          down += 1;
          const dist = rect.top - containerRect.bottom;
          if (dist < nearestDownDist) {
            nearestDownDist = dist;
            nearestDownEl = anchorRef.current;
          }
        } else {
          pins.anchor = pinPoint(rect);
        }
      }

      markRefs.current.forEach((el, matchIndex) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < containerRect.top) {
          up += 1;
          const dist = containerRect.top - rect.bottom;
          if (dist < nearestUpDist) {
            nearestUpDist = dist;
            nearestUpEl = el;
          }
        } else if (rect.top > containerRect.bottom) {
          down += 1;
          const dist = rect.top - containerRect.bottom;
          if (dist < nearestDownDist) {
            nearestDownDist = dist;
            nearestDownEl = el;
          }
        } else {
          pins[`match:${currentPageId}:${matchIndex}`] = pinPoint(rect);
        }
      });

      const upX = nearestUpEl
        ? nearestUpEl.getBoundingClientRect().left +
          nearestUpEl.getBoundingClientRect().width / 2 -
          paneRect.left
        : 0;
      const downX = nearestDownEl
        ? nearestDownEl.getBoundingClientRect().left +
          nearestDownEl.getBoundingClientRect().width / 2 -
          paneRect.left
        : 0;
      setInPageCues({
        up,
        down,
        upDist: Number.isFinite(nearestUpDist) ? nearestUpDist : 0,
        downDist: Number.isFinite(nearestDownDist) ? nearestDownDist : 0,
        upX,
        downX,
        nearestUpEl,
        nearestDownEl,
      });
      onReportPins(pins);
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
  }, [pendingRewrite, currentPageId, anchorOnThisPage, onReportPins]);

  // ---- Trail & time tools: scroll-linked "you are here" marker ----
  // While no travel animation is playing, each tool's marker snaps to
  // whichever pinned word on THIS page sits closest to the middle of the
  // visible diff area — live as the user scrolls, no button required.
  // Only one of the two is ever actually active at a time (pendingRewrite
  // is only ever one kind), the other's hook call just no-ops.
  useDistanceScrollMarker({
    active: isTrail,
    pendingRewrite,
    diffContainerRef,
    anchorRef,
    markRefs,
    anchorOnThisPage,
    currentPageId,
    pageMatches,
    pageStartOffsets,
    totalDocLength,
    distanceMode: trailDistanceMode,
    sizeForFraction: trailSizeForFraction,
    onScrollMarker: onTrailScrollMarker,
  });
  useDistanceScrollMarker({
    active: isTime,
    pendingRewrite,
    diffContainerRef,
    anchorRef,
    markRefs,
    anchorOnThisPage,
    currentPageId,
    pageMatches,
    pageStartOffsets,
    totalDocLength,
    distanceMode: timeDistanceMode,
    sizeForFraction: timeScrollSizeForFraction,
    onScrollMarker: onTimeScrollMarker,
  });

  const popupLabel =
    armedKind === "trail"
      ? "Drop trail marker & find other mentions"
      : armedKind === "time"
        ? "Drop stopwatch & find other mentions"
        : "Drop pin & find other mentions";

  return (
    <section className="editor-pane" ref={editorPaneRef}>
      {showPopup && (
        <div
          className={`refactor-popup ${popupPos.placeAbove ? "refactor-popup-above" : "refactor-popup-below"}`}
          style={{ left: popupPos.left, top: popupPos.top }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancelRewrite();
              setPopupPos(null);
            }
          }}
        >
          <div className="refactor-popup-actions">
            <button
              autoFocus
              className="btn btn-small btn-primary"
              onClick={() => {
                onRequestRewrite();
                setPopupPos(null);
              }}
            >
              {popupLabel}
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                onCancelRewrite();
                setPopupPos(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {hoverMatch && (
        <div
          className={`issue-popover ${hoverMatch.placeAbove ? "issue-popover-above" : "issue-popover-below"}`}
          style={{ left: hoverMatch.left, top: hoverMatch.top }}
          onMouseEnter={cancelHidePopover}
          onMouseLeave={scheduleHidePopover}
        >
          <p className="issue-popover-reason">
            Refers to the same {isTime ? "time" : "location"} as “{anchor?.name}”
          </p>
          <div className="issue-popover-actions">
            <button
              className="btn btn-small btn-primary"
              onClick={() => {
                onAcceptMatch(currentPageId, hoverMatch.index);
                setHoverMatch(null);
              }}
            >
              Accept
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                onDismissMatch(currentPageId, hoverMatch.index);
                setHoverMatch(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {haloCuesEnabled && inPageCues.up > 0 && (
        <HaloRing
          key="in-page-up"
          direction="up"
          x={inPageCues.upX}
          distance={scaleInPageDistance(inPageCues.upDist)}
          count={inPageCues.up}
          label={`${inPageCues.up} location pin${inPageCues.up > 1 ? "s" : ""} above — click to jump`}
          onClick={() =>
            inPageCues.nearestUpEl?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        />
      )}
      {haloCuesEnabled && inPageCues.down > 0 && (
        <HaloRing
          key="in-page-down"
          direction="down"
          x={inPageCues.downX}
          distance={scaleInPageDistance(inPageCues.downDist)}
          count={inPageCues.down}
          label={`${inPageCues.down} location pin${inPageCues.down > 1 ? "s" : ""} below — click to jump`}
          onClick={() =>
            inPageCues.nearestDownEl?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        />
      )}

      {pendingRewrite ? (
        <div className="rewrite-panel">
          {pendingRewrite.scope === "global" && (
            <p className="hint">
              {isTrail
                ? "Searched the entire document. Showing this page below — markers on other pages shrink with their distance from the pin."
                : isTime
                  ? "Searched the entire document. Showing this page below — stopwatches on other pages fill more the farther they are from the pin."
                  : "Searched the entire document. Showing this page below — pages with other mentions are also pinned in the rail on the left, connected by the line."}
            </p>
          )}
          <div className="rewrite-diff" ref={diffContainerRef}>
            {segments.map((seg) => {
              if (!seg.highlighted) return <span key={seg.key}>{seg.text}</span>;
              const style =
                isTrail || isTime ? distanceStyleFor(seg) : undefined;
              const toolClass = isTrail
                ? "location-trail"
                : isTime
                  ? "location-time"
                  : null;
              if (seg.isAnchor) {
                return (
                  <span
                    key={seg.key}
                    ref={anchorRef}
                    className={
                      toolClass
                        ? `location-pin ${toolClass} ${toolClass}-anchor`
                        : "location-pin location-anchor"
                    }
                    style={style}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      onRenameAnchor(e.currentTarget.textContent)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === "Escape") {
                        e.currentTarget.textContent = anchor.name;
                        e.currentTarget.blur();
                      }
                    }}
                  >
                    {seg.text}
                  </span>
                );
              }
              return (
                <mark
                  key={seg.key}
                  ref={(el) => registerMarkRef(seg.matchIndex, el)}
                  className={
                    toolClass
                      ? `location-pin ${toolClass} ${toolClass}-match`
                      : "location-pin location-match"
                  }
                  style={style}
                  onMouseEnter={(e) => showMatchPopover(e, seg.matchIndex)}
                  onMouseLeave={scheduleHidePopover}
                >
                  {seg.text}
                </mark>
              );
            })}
          </div>
          {pageMatches.length === 0 && !anchorOnThisPage && (
            <p className="hint">No other mentions found on this page.</p>
          )}
          <div className="rewrite-actions">
            {isTrail && (
              <button
                className="btn btn-small btn-ghost"
                onClick={onPlayTrailAnimation}
                title="Play a one-time animation of the marker traveling from the pin to each match in turn"
              >
                ▶ Play travel
              </button>
            )}
            {isTime && (
              <button
                className="btn btn-small btn-ghost"
                onClick={onPlayTimeAnimation}
                title="Play a one-time animation of the stopwatch traveling from the pin to each match in turn"
              >
                ▶ Play travel
              </button>
            )}
            <button
              className="btn btn-small btn-primary"
              onClick={onAcceptAllRewrite}
            >
              Accept all
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={onDismissAllRewrite}
            >
              Dismiss all
            </button>
          </div>
        </div>
      ) : (
        <textarea
          className={`editor-textarea ${armedKind ? `editor-textarea-${armedKind}` : ""}`}
          value={currentPage.rawText}
          onChange={(e) => {
            onChangeText(e.target.value);
            onSelectionChange(null);
            setPopupPos(null);
          }}
          onMouseUp={positionPopup}
          onKeyUp={(e) => {
            if (
              e.key.startsWith("Arrow") ||
              e.key === "Home" ||
              e.key === "End" ||
              (e.ctrlKey && e.key === "a")
            ) {
              positionPopup(e);
            }
          }}
          placeholder="Start typing..."
        />
      )}
      {rewriteLoading && (
        <p className="hint">Asking Ollama to search…</p>
      )}
      {rewriteError && <p className="hint hint-error">{rewriteError}</p>}
    </section>
  );
}
