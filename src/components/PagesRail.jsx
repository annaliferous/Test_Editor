import PageThumbnail from "./PageThumbnail";

// Left sidebar: list of page thumbnails (reorderable by drag) plus the
// "add page" button.
export default function PagesRail({
  pages,
  currentPageId,
  draggingPageId,
  rewritingPageIds,
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
