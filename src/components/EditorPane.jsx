import { useLayoutEffect, useRef, useState } from "react";
import { buildHighlightSegments } from "../utils/textHighlight";
import HaloRing from "./HaloRing";

// Maps a raw pixel distance (how far off-screen a flagged span is) to the
// "distance" HaloRing scales its ring radius from. Square-root compression
// so the ring keeps visibly shrinking across the whole scroll range instead
// of just the last handful of pixels before the target comes into view.
function scaleInPageDistance(px) {
  return Math.sqrt(Math.max(px, 0)) * 3;
}

// How long the issue popover stays up after the mouse leaves a highlight,
// so there's time to move the pointer into the popover to click a button.
const ISSUE_POPOVER_HIDE_DELAY = 150;

// Center panel. Shows one of two things for the current page:
//  - a pending consistency check's flagged spans, highlighted inline —
//    hovering one pops up an Accept/Dismiss choice for just that span
//  - a plain textarea, for free-text editing
export default function EditorPane({
  currentPageId,
  currentPage,
  onChangeText,
  selection,
  onSelectionChange,
  checkArmed,
  onCancelCheck,
  pendingCheck,
  checkLoading,
  checkError,
  onRequestCheck,
  onAcceptIssue,
  onDismissIssue,
  onAcceptAllCheck,
  onDismissAllCheck,
  haloCuesEnabled,
}) {
  const editorPaneRef = useRef(null);
  const [popupPos, setPopupPos] = useState(null);
  const [hoverIssue, setHoverIssue] = useState(null);
  const hoverHideTimeout = useRef(null);

  // Position the check popup near wherever the selection was made: the
  // mouse-up point for a drag-selection, or near the textarea for a
  // keyboard-driven one (shift+arrow, ctrl+a, ...).
  function positionPopup(e) {
    if (!checkArmed) return;
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

  function showIssuePopover(e, issueIndex, reason) {
    if (hoverHideTimeout.current) {
      clearTimeout(hoverHideTimeout.current);
      hoverHideTimeout.current = null;
    }
    const containerRect = editorPaneRef.current.getBoundingClientRect();
    const markRect = e.target.getBoundingClientRect();
    const left = markRect.left + markRect.width / 2 - containerRect.left;
    const top = markRect.top - containerRect.top;
    const POPUP_CLEARANCE = 70;
    setHoverIssue({
      index: issueIndex,
      reason,
      left: Math.min(Math.max(left, 20), containerRect.width - 20),
      top: Math.max(top, 10),
      placeAbove: top > POPUP_CLEARANCE,
    });
  }

  function scheduleHideIssuePopover() {
    hoverHideTimeout.current = setTimeout(
      () => setHoverIssue(null),
      ISSUE_POPOVER_HIDE_DELAY,
    );
  }

  function cancelHideIssuePopover() {
    if (hoverHideTimeout.current) {
      clearTimeout(hoverHideTimeout.current);
      hoverHideTimeout.current = null;
    }
  }

  const showPopup =
    checkArmed && selection && popupPos && !pendingCheck && !checkLoading;

  const currentPageIssues = pendingCheck?.issuesByPage[currentPageId] || [];

  // Annotate each highlighted segment with its index into currentPageIssues
  // (buildHighlightSegments walks that same array in order), so hovering
  // one can tell the accept/dismiss handlers exactly which issue it is.
  let highlightCounter = -1;
  const segments = buildHighlightSegments(
    currentPage.rawText,
    currentPageIssues,
  ).map((seg, idx) => ({
    ...seg,
    key: idx,
    issueIndex: seg.highlighted ? (highlightCounter += 1) : null,
  }));

  // ---- "Halo"-style off-screen cues for THIS page's own flagged spans ----
  // Which are scrolled out of view within the diff container, tracked via
  // refs to the actual <mark> elements so this stays correct as the user
  // scrolls or resolves issues. The ring is centered on the nearest
  // off-screen mark's own horizontal position (relative to editorPaneRef,
  // the positioned ancestor), not a fixed corner — it sits right above or
  // below where that content actually is.
  const diffContainerRef = useRef(null);
  const markRefs = useRef(new Map());
  const [inPageCues, setInPageCues] = useState({
    up: 0,
    down: 0,
    upDist: 0,
    downDist: 0,
    upX: 0,
    downX: 0,
    nearestUpEl: null,
    nearestDownEl: null,
  });
  // Every flagged word that's currently scrolled into view gets its own
  // small halo ring drawn right around it (via CSS), instead of the edge
  // cue — it settles there and stays until the issue is accepted or
  // dismissed. Words still off-screen contribute to the edge cue above.
  const [visibleHaloIndices, setVisibleHaloIndices] = useState(
    () => new Set(),
  );

  function registerMarkRef(issueIndex, el) {
    if (el) markRefs.current.set(issueIndex, el);
    else markRefs.current.delete(issueIndex);
  }

  useLayoutEffect(() => {
    if (!haloCuesEnabled || !pendingCheck) {
      setInPageCues({
        up: 0,
        down: 0,
        upDist: 0,
        downDist: 0,
        upX: 0,
        downX: 0,
        nearestUpEl: null,
        nearestDownEl: null,
      });
      setVisibleHaloIndices(new Set());
      return;
    }
    const container = diffContainerRef.current;
    const paneEl = editorPaneRef.current;
    if (!container || !paneEl) return;

    function recompute() {
      const containerRect = container.getBoundingClientRect();
      const paneRect = paneEl.getBoundingClientRect();
      let up = 0;
      let down = 0;
      let nearestUpEl = null;
      let nearestUpDist = Infinity;
      let nearestDownEl = null;
      let nearestDownDist = Infinity;
      const visible = new Set();
      markRefs.current.forEach((el, issueIndex) => {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < containerRect.top) {
          up += 1;
          const dist = containerRect.top - rect.bottom;
          if (dist < nearestUpDist) {
            nearestUpDist = dist;
            nearestUpEl = el;
          }
        } else if (rect.top > containerRect.bottom) {
          down += 1;
          const dist = rect.top - containerRect.bottom;
          if (dist < nearestDownDist) {
            nearestDownDist = dist;
            nearestDownEl = el;
          }
        } else {
          visible.add(issueIndex);
        }
      });
      const upX = nearestUpEl
        ? nearestUpEl.getBoundingClientRect().left +
          nearestUpEl.getBoundingClientRect().width / 2 -
          paneRect.left
        : 0;
      const downX = nearestDownEl
        ? nearestDownEl.getBoundingClientRect().left +
          nearestDownEl.getBoundingClientRect().width / 2 -
          paneRect.left
        : 0;
      setInPageCues({
        up,
        down,
        upDist: Number.isFinite(nearestUpDist) ? nearestUpDist : 0,
        downDist: Number.isFinite(nearestDownDist) ? nearestDownDist : 0,
        upX,
        downX,
        nearestUpEl,
        nearestDownEl,
      });
      setVisibleHaloIndices(visible);
    }

    recompute();
    container.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute);
    return () => {
      container.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [haloCuesEnabled, pendingCheck, currentPageId]);

  return (
    <section className="editor-pane" ref={editorPaneRef}>
      {showPopup && (
        <div
          className={`refactor-popup ${popupPos.placeAbove ? "refactor-popup-above" : "refactor-popup-below"}`}
          style={{ left: popupPos.left, top: popupPos.top }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancelCheck();
              setPopupPos(null);
            }
          }}
        >
          <div className="refactor-popup-actions">
            <button
              autoFocus
              className="btn btn-small btn-primary"
              onClick={() => {
                onRequestCheck();
                setPopupPos(null);
              }}
            >
              Check for inconsistencies
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                onCancelCheck();
                setPopupPos(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {hoverIssue && (
        <div
          className={`issue-popover ${hoverIssue.placeAbove ? "issue-popover-above" : "issue-popover-below"}`}
          style={{ left: hoverIssue.left, top: hoverIssue.top }}
          onMouseEnter={cancelHideIssuePopover}
          onMouseLeave={scheduleHideIssuePopover}
        >
          <p className="issue-popover-reason">{hoverIssue.reason}</p>
          <div className="issue-popover-actions">
            <button
              className="btn btn-small btn-primary"
              onClick={() => {
                onAcceptIssue(currentPageId, hoverIssue.index);
                setHoverIssue(null);
              }}
            >
              Accept
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                onDismissIssue(currentPageId, hoverIssue.index);
                setHoverIssue(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {haloCuesEnabled && inPageCues.up > 0 && (
        <HaloRing
          key="in-page-up"
          direction="up"
          x={inPageCues.upX}
          distance={scaleInPageDistance(inPageCues.upDist)}
          count={inPageCues.up}
          label={`${inPageCues.up} flagged issue${inPageCues.up > 1 ? "s" : ""} above — click to jump`}
          onClick={() =>
            inPageCues.nearestUpEl?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        />
      )}
      {haloCuesEnabled && inPageCues.down > 0 && (
        <HaloRing
          key="in-page-down"
          direction="down"
          x={inPageCues.downX}
          distance={scaleInPageDistance(inPageCues.downDist)}
          count={inPageCues.down}
          label={`${inPageCues.down} flagged issue${inPageCues.down > 1 ? "s" : ""} below — click to jump`}
          onClick={() =>
            inPageCues.nearestDownEl?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            })
          }
        />
      )}

      {pendingCheck ? (
        <div className="rewrite-panel">
          {pendingCheck.scope === "global" && (
            <p className="hint">
              Checked the entire document. Showing results for the current
              page below — pages with flagged issues are also highlighted in
              the rail on the left.
            </p>
          )}
          <div className="rewrite-diff" ref={diffContainerRef}>
            {segments.map((seg) =>
              seg.highlighted ? (
                <mark
                  key={seg.key}
                  ref={(el) => registerMarkRef(seg.issueIndex, el)}
                  className={`inconsistency-highlight ${haloCuesEnabled && visibleHaloIndices.has(seg.issueIndex) ? "halo-word-ring" : ""}`}
                  onMouseEnter={(e) =>
                    showIssuePopover(e, seg.issueIndex, seg.reason)
                  }
                  onMouseLeave={scheduleHideIssuePopover}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={seg.key}>{seg.text}</span>
              ),
            )}
          </div>
          {currentPageIssues.length === 0 && (
            <p className="hint">
              No inconsistencies found
              {pendingCheck.scope === "local" ? " in the selected text." : "."}
            </p>
          )}
          <div className="rewrite-actions">
            <button
              className="btn btn-small btn-primary"
              onClick={onAcceptAllCheck}
            >
              Accept all
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={onDismissAllCheck}
            >
              Dismiss all
            </button>
          </div>
        </div>
      ) : (
        <textarea
          className={`editor-textarea ${checkArmed ? "editor-textarea-quill" : ""}`}
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
      {checkLoading && (
        <p className="hint">Asking Ollama to check for inconsistencies…</p>
      )}
      {checkError && <p className="hint hint-error">{checkError}</p>}
    </section>
  );
}
