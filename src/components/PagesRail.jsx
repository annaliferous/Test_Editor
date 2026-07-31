import PageThumbnail from "./PageThumbnail";

// Base delay (seconds) before the ripple reaches the first page thumbnail,
// and the step between each subsequent one — a continuation of the wave
// that starts in the main editor's text.
const RIPPLE_PAGE_BASE_DELAY = 0.5;
const RIPPLE_PAGE_STEP = 0.12;

// Left sidebar: list of page thumbnails (reorderable by drag) plus the
// "add page" button.
export default function PagesRail({
  pages,
  currentPageId,
  draggingPageId,
  rewritingPageIds,
  rippleActive,
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
            rippleDelay={RIPPLE_PAGE_BASE_DELAY + idx * RIPPLE_PAGE_STEP}
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
