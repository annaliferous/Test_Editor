import { useRef, useState } from "react";

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
  selection,
  onSelectionChange,
  refactorArmed,
  onCancelRefactor,
  refactorPrompt,
  onSetRefactorPrompt,
  pendingRefactor,
  refactorLoading,
  refactorError,
  onRequestRefactor,
  onAcceptRefactor,
  onRejectRefactor,
}) {
  const editorPaneRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);

  // Position the refactor popup near wherever the selection was made: the
  // mouse-up point for a drag-selection, or near the textarea for a
  // keyboard-driven one (shift+arrow, ctrl+a, ...).
  function positionPopup(e) {
    if (!refactorArmed) return;
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

  const showPopup =
    refactorArmed &&
    selection &&
    popupPos &&
    !pendingRefactor &&
    !pendingRewrite &&
    !refactorLoading &&
    !rewriteLoading;

  return (
    <section className="editor-pane" ref={editorPaneRef}>
      {showPopup && (
        <div
          className={`refactor-popup ${popupPos.placeAbove ? "refactor-popup-above" : "refactor-popup-below"}`}
          style={{ left: popupPos.left, top: popupPos.top }}
        >
          <input
            autoFocus
            type="text"
            className="refactor-popup-input"
            placeholder="Describe the rewrite…"
            value={refactorPrompt}
            onChange={(e) => onSetRefactorPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && refactorPrompt.trim()) {
                e.preventDefault();
                onRequestRefactor();
                setPopupPos(null);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelRefactor();
                setPopupPos(null);
              }
            }}
          />
        </div>
      )}
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

      {pendingRefactor ? (
        <div className="rewrite-panel">
          {pendingRefactor.scope === "global" && (
            <p className="hint">
              This refactor will apply to all{" "}
              {Object.keys(pendingRefactor.diffsByPage).length} pages. Showing
              preview for the current page below.
            </p>
          )}
          <div className="rewrite-diff">
            {(pendingRefactor.diffsByPage[currentPageId] || []).map(
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
              onClick={onAcceptRefactor}
            >
              Accept
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={onRejectRefactor}
            >
              Reject
            </button>
          </div>
        </div>
      ) : pendingRewrite ? (
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
          className={`editor-textarea ${refactorArmed ? "editor-textarea-quill" : ""}`}
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
      {isSearchMode && !pendingRewrite && (
        <p className="mode-warning">
          Editing is disabled in Search mode. Switch to Rewrite to write or
          edit text.
        </p>
      )}
      {rewriteLoading && <p className="hint">Asking Ollama for a rewrite…</p>}
      {rewriteError && <p className="hint hint-error">{rewriteError}</p>}
      {refactorLoading && <p className="hint">Asking Ollama to refactor…</p>}
      {refactorError && <p className="hint hint-error">{refactorError}</p>}
    </section>
  );
}
