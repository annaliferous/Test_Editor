import { useLayoutEffect, useRef, useState } from "react";
import { buildHighlightSegments } from "../utils/textHighlight";
import HaloRing from "./HaloRing";

// Thumbnails don't scroll internally — .page-thumb-viewport just clips
// whatever overflows its fixed 150px height — so this only needs to be
// recomputed when the content or flagged issues change, not on scroll.
function scaleThumbDistance(px) {
  return Math.sqrt(Math.max(px, 0)) * 1.5;
}

// Thumbnail shown in the left rail for a single page: renders a mini
// preview (flagged inconsistencies, or raw text), the page number, and a
// delete button. When a flagged span is clipped by the thumbnail's own
// viewport, a small halo ring surfaces it, centered on that span's actual
// horizontal position, so it reads at a glance even at this tiny scale.
export default function PageThumbnail({
  page,
  pageNumber,
  isActive,
  isDragging,
  issues,
  haloCuesEnabled,
  innerRef,
  onPointerDown,
  onClick,
  onDelete,
  canDelete,
}) {
  const viewportRef = useRef(null);
  const markRefs = useRef(new Map());
  const [clipCue, setClipCue] = useState(null);
  // Marks not clipped by the 150px viewport get their own small ring drawn
  // right around them instead, and keep it until resolved — mirroring the
  // main editor's on-screen halo treatment at thumbnail scale.
  const [visibleHaloIndices, setVisibleHaloIndices] = useState(
    () => new Set(),
  );

  function registerMarkRef(issueIndex, el) {
    if (el) markRefs.current.set(issueIndex, el);
    else markRefs.current.delete(issueIndex);
  }

  useLayoutEffect(() => {
    if (!haloCuesEnabled || !issues || issues.length === 0) {
      setClipCue(null);
      setVisibleHaloIndices(new Set());
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const viewportRect = viewport.getBoundingClientRect();
    let count = 0;
    let nearestX = 0;
    let nearestDist = Infinity;
    const visible = new Set();
    markRefs.current.forEach((el, idx) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= viewportRect.bottom) {
        visible.add(idx);
        return;
      }
      count += 1;
      const dist = Math.max(0, rect.top - viewportRect.bottom);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestX = rect.left + rect.width / 2 - viewportRect.left;
      }
    });
    setClipCue(
      count === 0
        ? null
        : { x: nearestX, distance: nearestDist, count },
    );
    setVisibleHaloIndices(visible);
  }, [haloCuesEnabled, issues, page.rawText]);

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
        {issues && issues.length > 0 ? (
          <div className="page-thumb-text page-thumb-issues">
            {buildHighlightSegments(page.rawText, issues).map((seg, idx) =>
              seg.highlighted ? (
                <mark
                  key={idx}
                  ref={(el) => registerMarkRef(idx, el)}
                  className={`inconsistency-highlight ${haloCuesEnabled && visibleHaloIndices.has(idx) ? "halo-word-ring" : ""}`}
                  title={seg.reason}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={idx}>{seg.text}</span>
              ),
            )}
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
            label={`${clipCue.count} flagged issue${clipCue.count > 1 ? "s" : ""} clipped below`}
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
