import PageThumbnail from "./PageThumbnail";
import { useCascadingBars } from "../hooks/useCascadingBars";

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

  return (
    <aside className="pages-pane">
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
    </aside>
  );
}
