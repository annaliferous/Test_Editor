import { useLayoutEffect, useRef, useState } from "react";
import { buildLocationSegments } from "../utils/textHighlight";
import { globalOffset, trailShrinkFraction, TIME_ICON_SIZE_THUMB } from "../utils/trailScale";
import HaloRing from "./HaloRing";

// Thumbnails don't scroll internally — .page-thumb-viewport just clips
// whatever overflows its fixed 150px height. But the thumbnail's own
// on-screen position moves whenever the PagesRail itself scrolls, so pin
// positions still need recomputing then, even though nothing local changed.
function scaleThumbDistance(px) {
  return Math.sqrt(Math.max(px, 0)) * 1.5;
}

// Matches the offset EditorPane uses, at thumbnail scale.
const PIN_VERTICAL_OFFSET = 8;

// Trail-tool marker sizes at thumbnail scale — smaller than the editor's,
// so even the "closest" marker doesn't overwhelm a 150px box. The anchor
// is a fixed size distinctly bigger than any match can reach (see
// EditorPane.jsx for why), so it always reads as the biggest.
const ANCHOR_SIZE = 18;
const TRAIL_MAX_SIZE = 12;
const TRAIL_MIN_SIZE = 5;

const anchorTrailStyle = { "--trail-size": `${ANCHOR_SIZE}px`, "--trail-opacity": 1 };

function trailPinStyle(t) {
  return {
    "--trail-size": `${TRAIL_MAX_SIZE - t * (TRAIL_MAX_SIZE - TRAIL_MIN_SIZE)}px`,
    "--trail-opacity": Math.max(0, 1 - t),
  };
}

// Time-tool stopwatch at thumbnail scale — constant size, only its fill
// varies (see EditorPane.jsx for why).
function timeIconStyle(t) {
  return { "--time-size": `${TIME_ICON_SIZE_THUMB}px`, "--time-fill": t };
}
const anchorTimeStyle = timeIconStyle(0);

// Thumbnail shown in the left rail for a single page: renders a mini
// preview (pinned location mentions, or raw text), the page number, and a
// delete button. Editing only happens in the main editor — here pins are
// read-only, just enough to see at a glance where this page fits in.
//
// Pin-tool markers: when clipped by the thumbnail's own viewport, a small
// halo ring surfaces it; otherwise its screen position is reported upward
// so the app-level connecting line can reach right into this thumbnail.
// Trail- and time-tool markers don't report a position or get a clip ring
// — their appearance alone (by document distance from the anchor) is the
// whole cue, and that's independent of anything scroll- or viewport-related.
export default function PageThumbnail({
  page,
  pageNumber,
  isActive,
  isDragging,
  pendingRewrite,
  haloCuesEnabled,
  onReportPins,
  pageStartOffsets,
  totalDocLength,
  trailDistanceMode,
  timeDistanceMode,
  innerRef,
  onPointerDown,
  onClick,
  onDelete,
  canDelete,
}) {
  const viewportRef = useRef(null);
  const anchorRef = useRef(null);
  const markRefs = useRef(new Map());
  const [clipCue, setClipCue] = useState(null);

  const anchor = pendingRewrite?.anchor;
  const anchorOnThisPage = anchor?.pageId === page.id;
  const matches = pendingRewrite?.matchesByPage[page.id] || [];
  const hasPins = anchorOnThisPage || matches.length > 0;
  const isTrail = pendingRewrite?.kind === "trail";
  const isTime = pendingRewrite?.kind === "time";

  function registerMarkRef(matchIndex, el) {
    if (el) markRefs.current.set(matchIndex, el);
    else markRefs.current.delete(matchIndex);
  }

  useLayoutEffect(() => {
    if (!hasPins || isTrail || isTime) {
      setClipCue(null);
      onReportPins({});
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const railScrollEl = viewport.closest(".pages-scroll");

    function pinPoint(rect) {
      return {
        x: rect.left + rect.width / 2,
        y: rect.top - PIN_VERTICAL_OFFSET,
      };
    }

    function recompute() {
      const viewportRect = viewport.getBoundingClientRect();
      const railRect = railScrollEl?.getBoundingClientRect();
      // Whether THIS SPECIFIC pin is currently within the rail's own
      // scroll viewport — checked per pin, not per thumbnail, since a
      // thumbnail can be only partially visible (straddling the rail's
      // top or bottom edge) while a given pin inside it still sits in the
      // clipped-off part. Reporting it anyway would spill the connecting
      // line out past the rail's edge instead of staying confined to it;
      // the rail-level halo ring cue (rendered separately) covers that
      // case instead.
      function withinRail(rect) {
        return (
          !railRect || (rect.bottom > railRect.top && rect.top < railRect.bottom)
        );
      }

      let count = 0;
      let nearestX = 0;
      let nearestDist = Infinity;
      const pins = {};

      if (anchorOnThisPage && anchorRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        if (rect.bottom > viewportRect.bottom) {
          count += 1;
          const dist = Math.max(0, rect.top - viewportRect.bottom);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestX = rect.left + rect.width / 2 - viewportRect.left;
          }
        } else if (!isActive && withinRail(rect)) {
          // While this page is active, the editor already renders (and
          // reports) the anchor at a truer position — no need to double up.
          pins.anchor = pinPoint(rect);
        }
      }

      markRefs.current.forEach((el, matchIndex) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > viewportRect.bottom) {
          count += 1;
          const dist = Math.max(0, rect.top - viewportRect.bottom);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestX = rect.left + rect.width / 2 - viewportRect.left;
          }
        } else if (!isActive && withinRail(rect)) {
          pins[`match:${page.id}:${matchIndex}`] = pinPoint(rect);
        }
      });

      setClipCue(
        count === 0 ? null : { x: nearestX, distance: nearestDist, count },
      );
      onReportPins(pins);
    }

    recompute();
    // The thumbnail never scrolls internally, but its on-screen position
    // still moves whenever the rail around it scrolls, the whole page
    // scrolls, or the window resizes — all need to re-trigger this, not
    // just local changes.
    railScrollEl?.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      railScrollEl?.removeEventListener("scroll", recompute);
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [hasPins, isTrail, isTime, anchorOnThisPage, matches, page.rawText, isActive, page.id, onReportPins]);

  const segments = hasPins
    ? buildLocationSegments(page.rawText, page.id, anchor, matches)
    : null;

  function distanceStyleFor(span) {
    if (span.isAnchor) return isTime ? anchorTimeStyle : anchorTrailStyle;
    const anchorGlobalPos = globalOffset(
      pageStartOffsets,
      anchor.pageId,
      anchor.start,
    );
    const matchGlobalPos = globalOffset(pageStartOffsets, page.id, span.start);
    const t = trailShrinkFraction({
      anchorGlobalPos,
      matchGlobalPos,
      totalDocLength,
      mode: isTime ? timeDistanceMode : trailDistanceMode,
    });
    return isTime ? timeIconStyle(t) : trailPinStyle(t);
  }

  const toolClass = isTrail ? "location-trail" : isTime ? "location-time" : null;

  return (
    <div
      ref={innerRef}
      className={[
        "page-thumb",
        isActive ? "page-thumb-active" : "",
        isDragging ? "page-thumb-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div className="page-thumb-viewport" ref={viewportRef}>
        {segments ? (
          <div className="page-thumb-text page-thumb-issues">
            {segments.map((seg) => {
              if (!seg.highlighted) {
                return <span key={seg.key}>{seg.text}</span>;
              }
              const style = toolClass ? distanceStyleFor(seg) : undefined;
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
                    title={`${isTime ? "Time" : "Location"}: ${anchor.name}`}
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
                  title={`Refers to the same ${isTime ? "time" : "location"} as "${anchor?.name}"`}
                >
                  {seg.text}
                </mark>
              );
            })}
          </div>
        ) : (
          <div className="page-thumb-text">
            {page.rawText || (
              <span className="page-thumb-empty">Empty page</span>
            )}
          </div>
        )}
        {haloCuesEnabled && clipCue && (
          <HaloRing
            direction="down"
            x={clipCue.x}
            distance={scaleThumbDistance(clipCue.distance)}
            count={clipCue.count}
            label={`${clipCue.count} location pin${clipCue.count > 1 ? "s" : ""} clipped below`}
            onClick={onClick}
            minRadius={6}
            maxRadius={22}
            peek={5}
            clipWidth={36}
          />
        )}
      </div>
      <div className="page-thumb-footer">
        <span className="page-thumb-number">{pageNumber}</span>
        {canDelete && (
          <button
            className="page-thumb-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete page ${pageNumber}`}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
