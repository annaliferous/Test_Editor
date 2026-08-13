import { useLayoutEffect, useRef, useState } from "react";
import PageThumbnail from "./PageThumbnail";
import HaloRing from "./HaloRing";

// Distance-to-ring-size scaling for the rail's own halo: the stack of page
// thumbnails is treated as one continuous canvas, so a flagged page
// scrolled out of the rail's own viewport gets a ring here exactly the way
// an off-screen mark gets one in the editor — sized from real pixel
// distance in the rail's own scroll space, not confined to any one
// thumbnail's boundary.
function scaleRailDistance(px) {
  return Math.sqrt(Math.max(px, 0)) * 3;
}

// Left sidebar: list of page thumbnails (reorderable by drag) plus the
// "add page" button.
export default function PagesRail({
  pages,
  currentPageId,
  draggingPageId,
  issuesByPage,
  registerPageRef,
  dragMovedRef,
  onPageDragStart,
  onSwitchPage,
  onDeletePage,
  onAddPage,
  haloCuesEnabled,
}) {
  const scrollRef = useRef(null);
  const thumbRefs = useRef(new Map());
  const [railCues, setRailCues] = useState({
    up: 0,
    down: 0,
    upDist: 0,
    downDist: 0,
    upPageId: null,
    downPageId: null,
  });

  function registerHaloThumbRef(pageId, el) {
    if (el) thumbRefs.current.set(pageId, el);
    else thumbRefs.current.delete(pageId);
  }

  useLayoutEffect(() => {
    if (!haloCuesEnabled || !issuesByPage) {
      setRailCues({
        up: 0,
        down: 0,
        upDist: 0,
        downDist: 0,
        upPageId: null,
        downPageId: null,
      });
      return;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    function recompute() {
      const containerRect = scrollEl.getBoundingClientRect();
      let up = 0;
      let down = 0;
      let nearestUpDist = Infinity;
      let nearestUpId = null;
      let nearestDownDist = Infinity;
      let nearestDownId = null;
      pages.forEach((page) => {
        const pageIssues = issuesByPage?.[page.id];
        if (!pageIssues || pageIssues.length === 0) return;
        const el = thumbRefs.current.get(page.id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < containerRect.top) {
          up += 1;
          const dist = containerRect.top - rect.bottom;
          if (dist < nearestUpDist) {
            nearestUpDist = dist;
            nearestUpId = page.id;
          }
        } else if (rect.top > containerRect.bottom) {
          down += 1;
          const dist = rect.top - containerRect.bottom;
          if (dist < nearestDownDist) {
            nearestDownDist = dist;
            nearestDownId = page.id;
          }
        }
      });
      setRailCues({
        up,
        down,
        upDist: Number.isFinite(nearestUpDist) ? nearestUpDist : 0,
        downDist: Number.isFinite(nearestDownDist) ? nearestDownDist : 0,
        upPageId: nearestUpId,
        downPageId: nearestDownId,
      });
    }

    recompute();
    scrollEl.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      scrollEl.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [haloCuesEnabled, issuesByPage, pages]);

  function jumpToPage(pageId) {
    if (!pageId) return;
    onSwitchPage(pageId);
    thumbRefs.current.get(pageId)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

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
              issues={issuesByPage?.[page.id] ?? null}
              haloCuesEnabled={haloCuesEnabled}
              innerRef={(el) => {
                registerPageRef(page.id, el);
                registerHaloThumbRef(page.id, el);
              }}
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
      </div>

      {haloCuesEnabled && railCues.up > 0 && (
        <HaloRing
          key="rail-up"
          direction="up"
          x="50%"
          distance={scaleRailDistance(railCues.upDist)}
          count={railCues.up}
          label={`${railCues.up} page${railCues.up > 1 ? "s" : ""} with flagged issues above — click to jump`}
          onClick={() => jumpToPage(railCues.upPageId)}
        />
      )}
      {haloCuesEnabled && railCues.down > 0 && (
        <HaloRing
          key="rail-down"
          direction="down"
          x="50%"
          distance={scaleRailDistance(railCues.downDist)}
          count={railCues.down}
          label={`${railCues.down} page${railCues.down > 1 ? "s" : ""} with flagged issues below — click to jump`}
          onClick={() => jumpToPage(railCues.downPageId)}
        />
      )}

      <button
        className="btn btn-small btn-ghost add-page-btn"
        onClick={onAddPage}
      >
        + Add page
      </button>
    </aside>
  );
}
