// Center panel. Shows one of three things for the current page:
//  - a pending rewrite's diff, with accept/reject actions
//  - the word canvas (Search mode), where words can be clicked to select
//  - a plain textarea (Rewrite mode), for free-text editing
export default function EditorPane({
  rewriteLoading,
  loadingAnim,
  pendingRewrite,
  scope,
  currentPageId,
  onAcceptRewrite,
  onRejectRewrite,
  isSearchMode,
  intensity,
  intensityToDuration,
  currentPage,
  selectedIds,
  onToggleWord,
  onChangeText,
  rewriteError,
}) {
  return (
    <section className="editor-pane">
      {rewriteLoading && loadingAnim && (
        <div className="loading-overlay" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <img
              key={i}
              src={loadingAnim.gif}
              alt=""
              className="loading-gif"
              style={{
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
                width: `${28 + (i % 3) * 14}px`,
                animationDelay: `${(i * 0.18).toFixed(2)}s`,
                animationDuration: `${1.1 + (i % 3) * 0.25}s`,
              }}
            />
          ))}
        </div>
      )}

      {pendingRewrite ? (
        <div className="rewrite-panel">
          {scope === "global" && (
            <p className="hint">
              This rewrite will apply to all{" "}
              {Object.keys(pendingRewrite.diffsByPage).length} pages. Showing
              preview for the current page below.
            </p>
          )}
          <div className="rewrite-diff">
            {(pendingRewrite.diffsByPage[currentPageId] || []).map(
              (d, idx) => (
                <span key={idx} className={`diff-word diff-${d.type}`}>
                  {d.text}{" "}
                </span>
              ),
            )}
          </div>
          <div className="rewrite-actions">
            <button
              className="btn btn-small btn-primary"
              onClick={onAcceptRewrite}
            >
              Accept
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={onRejectRewrite}
            >
              Reject
            </button>
          </div>
        </div>
      ) : isSearchMode ? (
        <div
          className="word-canvas"
          style={{
            "--joy-duration": `${intensityToDuration(intensity.joy, 0.35, 1.1)}s`,
            "--love-duration": `${intensityToDuration(intensity.love, 0.5, 2)}s`,
          }}
        >
          {currentPage.words.map((word) => (
            <div
              key={`${word.id}-${word.run}`}
              className={[
                "word",
                word.animation ? `anim-${word.animation}` : "",
                selectedIds.has(word.id) ? "word-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onToggleWord(word.id)}
            >
              {word.text}
            </div>
          ))}
        </div>
      ) : (
        <textarea
          className="editor-textarea"
          value={currentPage.rawText}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="Start typing..."
        />
      )}
      {isSearchMode && !pendingRewrite && (
        <p className="mode-warning">
          Editing is disabled in Search mode. Switch to Rewrite to write or
          edit text.
        </p>
      )}
      {rewriteLoading && <p className="hint">Asking Ollama for a rewrite…</p>}
      {rewriteError && <p className="hint hint-error">{rewriteError}</p>}
    </section>
  );
}
