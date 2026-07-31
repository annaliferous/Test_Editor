// Thumbnail shown in the left rail for a single page: renders a mini
// preview (animated words or raw text), the page number, a delete button,
// and a loading overlay while a rewrite is in flight for this page.
export default function PageThumbnail({
  page,
  pageNumber,
  isActive,
  isDragging,
  isRewriting,
  isRippling,
  rippleDelay,
  loadingAnim,
  intensity,
  intensityToDuration,
  innerRef,
  onPointerDown,
  onClick,
  onDelete,
  canDelete,
}) {
  return (
    <div
      ref={innerRef}
      className={[
        "page-thumb",
        isActive ? "page-thumb-active" : "",
        isDragging ? "page-thumb-dragging" : "",
        isRippling ? "page-thumb-rippling" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={isRippling ? { "--ripple-delay": `${rippleDelay}s` } : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <div className="page-thumb-viewport">
        {isRewriting && loadingAnim && (
          <div
            className="loading-overlay page-thumb-loading-overlay"
            aria-hidden="true"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <img
                key={i}
                src={loadingAnim.gif}
                alt=""
                className="loading-gif page-thumb-loading-gif"
                style={{
                  left: `${(i * 41) % 100}%`,
                  top: `${(i * 59) % 100}%`,
                  width: `18px`,
                  animationDelay: `${(i * 0.18).toFixed(2)}s`,
                  animationDuration: `${1.1 + (i % 3) * 0.25}s`,
                }}
              />
            ))}
          </div>
        )}
        {page.words.length > 0 ? (
          <div
            className="page-thumb-canvas"
            style={{
              "--joy-duration": `${intensityToDuration(intensity.joy, 0.35, 1.1)}s`,
              "--love-duration": `${intensityToDuration(intensity.love, 0.5, 2)}s`,
            }}
          >
            {page.words.map((w) => (
              <div
                key={`${w.id}-${w.run}`}
                className={["word", w.animation ? `anim-${w.animation}` : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {w.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="page-thumb-text">
            {page.rawText || (
              <span className="page-thumb-empty">Empty page</span>
            )}
          </div>
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
