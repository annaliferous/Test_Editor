import { tokenize } from "../utils/wordDiff";

// Total time (seconds) the words *within* one thumbnail's own ripple spread
// across, regardless of how many words it has. Kept well under the gap
// between thumbnails (see PagesRail's RIPPLE_PAGE_STEP) so a long page's
// internal spread doesn't blur into the next thumbnail's ripple and mask
// the page-to-page cascade.
const RIPPLE_WORD_SPREAD = 0.2;

// Thumbnail shown in the left rail for a single page: renders a mini
// preview (animated words, a ripple while the AI is thinking, an AI diff
// preview once one is ready, or raw text), the page number, a delete
// button, and a loading overlay while a rewrite is in flight for this page.
export default function PageThumbnail({
  page,
  pageNumber,
  isActive,
  isDragging,
  isRewriting,
  isRippling,
  rippleDelay,
  isBarsRippling,
  registerBarsCanvas,
  pendingDiff,
  loadingAnim,
  intensity,
  intensityToDuration,
  innerRef,
  onPointerDown,
  onClick,
  onDelete,
  canDelete,
}) {
  const rippleWords = isRippling && !pendingDiff ? tokenize(page.rawText) : [];
  const rippleOrigin = (rippleWords.length - 1) / 2;
  const rippleWordStep =
    rippleOrigin > 0 ? RIPPLE_WORD_SPREAD / rippleOrigin : 0;

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
        {pendingDiff ? (
          <div className="page-thumb-diff">
            {pendingDiff.map((d, idx) => (
              <span key={idx} className={`diff-word diff-${d.type}`}>
                {d.text}{" "}
              </span>
            ))}
          </div>
        ) : rippleWords.length > 0 ? (
          <div className="page-thumb-ripple-canvas">
            {rippleWords.map((word, idx) => (
              <span
                key={idx}
                className="thumb-ripple-word"
                style={{
                  "--ripple-delay": `${rippleDelay + Math.abs(idx - rippleOrigin) * rippleWordStep}s`,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        ) : page.words.length > 0 ? (
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
        {isBarsRippling && !pendingDiff && (
          <canvas
            className="page-thumb-bars-canvas page-thumb-bars-overlay"
            ref={(el) => registerBarsCanvas(page.id, el)}
            aria-hidden="true"
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
