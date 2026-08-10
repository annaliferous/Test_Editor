import { useState, useEffect } from "react";
import "./App.css";

import {
  EMOTION_WORD_LISTS,
  getEmotionMatchIdsInWords,
} from "./data/animations";
import {
  makePage,
  makePagesFromText,
  splitTextIntoChunks,
  DEFAULT_MAX_PAGE_CHARS,
} from "./utils/pages";
import { newWordId } from "./utils/ids";
import { intensityToDuration } from "./utils/animationMath";

import { usePageDrag } from "./hooks/usePageDrag";
import { useGifDrag } from "./hooks/useGifDrag";
import { useRewrite } from "./hooks/useRewrite";
import { useRefactor } from "./hooks/useRefactor";

import PagesRail from "./components/PagesRail";
import EditorPane from "./components/EditorPane";
import ControlsPane from "./components/ControlsPane";
import DragGhost from "./components/DragGhost";
import StartupModal from "./components/StartupModal";

function App() {
  // ---- Core document state: pages, the active page, and word selection ----
  // Starts as a single empty page; the startup modal below lets the user
  // replace it with an uploaded file or the sample text before they start
  // editing, or just dismiss it and keep writing from scratch.
  const [pages, setPages] = useState([makePage("")]);
  const [currentPageId, setCurrentPageId] = useState(pages[0].id);
  const currentPage = pages.find((p) => p.id === currentPageId) ?? pages[0];

  const [scope, setScope] = useState("local"); // "local" | "global"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [mode, setMode] = useState("rewrite"); // "rewrite" (free text) | "search" (word selection)
  const isSearchMode = mode === "search";
  const [intensity, setIntensity] = useState({ joy: 50, love: 50 });
  // Range selected in the Rewrite-mode textarea, for the Refactor flow:
  // { start, end, text }, relative to currentPage.rawText. Null when nothing
  // is selected.
  const [selection, setSelection] = useState(null);
  // Which Refactor tool is "armed" (null | "ripple" | "bars"): only while
  // armed does selecting text in the textarea show the quill cursor and pop
  // up the instruction prompt. There are two quill buttons — same tool,
  // different "AI thinking" loading animation — toggled by clicking either.
  const [refactorTool, setRefactorTool] = useState(null);
  // Which animation style the in-flight refactor request is using, frozen
  // at submit time (refactorTool itself gets cleared immediately on submit).
  const [refactorAnimStyle, setRefactorAnimStyle] = useState("ripple");
  // Shown on first load, so the user can choose how to start the document.
  const [showStartupModal, setShowStartupModal] = useState(true);

  function loadDocumentText(text) {
    const cleaned = text.trim().replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n");
    const newPages = makePagesFromText(cleaned);
    setPages(newPages);
    setCurrentPageId(newPages[0].id);
    setShowStartupModal(false);
  }

  function startEmptyDocument() {
    setShowStartupModal(false);
  }

  function openStartupModal() {
    setShowStartupModal(true);
  }

  // Split a page's rawText into selectable words the first time it's
  // needed in Search mode (either the current page, or every page when
  // scope is "global").
  useEffect(() => {
    if (mode !== "search") return;
    setPages((prev) => {
      let changed = false;
      const next = prev.map((page) => {
        const shouldSplit = scope === "global" || page.id === currentPageId;
        if (!shouldSplit || page.words.length > 0) return page;
        const parts = page.rawText.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return page;
        changed = true;
        return {
          ...page,
          words: parts.map((text) => ({
            id: newWordId(),
            text,
            animation: null,
            run: 0,
          })),
        };
      });
      return changed ? next : prev;
    });
  }, [mode, scope, currentPageId]);

  function switchMode(newMode) {
    setSelection(null);
    setPendingRefactor(null);
    setRefactorTool(null);
    if (newMode === "search") {
      // Split current page into words if it isn't already
      setCurrentPageWords((prevWords) => {
        if (prevWords.length > 0) return prevWords;
        const parts = currentPage.rawText.trim().split(/\s+/).filter(Boolean);
        return parts.map((text) => ({
          id: newWordId(),
          text,
          animation: null,
          run: 0,
        }));
      });
    } else if (newMode === "rewrite") {
      // Going back to free-text editing: collapse words back into rawText
      // so typing continues from the latest word content. Note: this
      // intentionally drops per-word animation state, since rewrite mode
      // treats the page as plain text again.
      if (currentPage.words.length > 0) {
        const text = currentPage.words.map((w) => w.text).join(" ");
        updatePage(currentPageId, () => ({ rawText: text, words: [] }));
      }
    }
    setMode(newMode);
  }

  // ---- Page-scoped helpers ----
  function updatePage(pageId, updater) {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, ...updater(p) } : p)),
    );
  }

  function updateCurrentPageText(text) {
    if (text.length <= DEFAULT_MAX_PAGE_CHARS) {
      updatePage(currentPageId, () => ({ rawText: text }));
      return;
    }
    // Typed (or pasted) past one page's worth of text: keep the head on
    // this page and spill the rest into new page(s) right after it, split
    // at the same word/sentence-aware boundaries as a bulk-loaded file.
    const [head, ...overflowChunks] = splitTextIntoChunks(
      text,
      DEFAULT_MAX_PAGE_CHARS,
    );
    const overflowPages = overflowChunks.map((chunk) => makePage(chunk));
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === currentPageId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], rawText: head };
      next.splice(idx + 1, 0, ...overflowPages);
      return next;
    });
  }

  function setCurrentPageWords(updaterOrArray) {
    updatePage(currentPageId, (p) => ({
      words:
        typeof updaterOrArray === "function"
          ? updaterOrArray(p.words)
          : updaterOrArray,
    }));
  }

  function switchPage(pageId) {
    setCurrentPageId(pageId);
    setSelectedIds(new Set());
    setPendingRewrite(null);
    setPendingRefactor(null);
    setSelection(null);
    setRefactorTool(null);
  }

  function addPage() {
    const newPage = makePage("");
    setPages((prev) => [...prev, newPage]);
    switchPage(newPage.id);
  }

  function deletePage(pageId) {
    setPages((prev) => {
      if (prev.length === 1) return prev;
      const idx = prev.findIndex((p) => p.id === pageId);
      const filtered = prev.filter((p) => p.id !== pageId);
      if (pageId === currentPageId) {
        const fallback = filtered[Math.max(0, idx - 1)];
        switchPage(fallback.id);
      }
      return filtered;
    });
  }

  // Drag-to-reorder the page thumbnails in the left rail.
  const { draggingPageId, dragMovedRef, registerPageRef, startPageDrag } =
    usePageDrag(pages, setPages);

  function toggleWord(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getEmotionMatchIds(animationKey) {
    return getEmotionMatchIdsInWords(currentPage.words, animationKey);
  }

  function applyAnimation(animationKey) {
    const matchedIds = getEmotionMatchIds(animationKey);
    const targetIds = new Set([...selectedIds, ...matchedIds]);
    if (targetIds.size === 0) return;

    const targetWords = currentPage.words.filter((w) => targetIds.has(w.id));
    const allAlreadyActive = targetWords.every(
      (w) => w.animation === animationKey,
    );
    const nextAnim = allAlreadyActive ? null : animationKey;

    if (scope === "local") {
      setCurrentPageWords((prev) =>
        prev.map((w) =>
          targetIds.has(w.id)
            ? { ...w, animation: nextAnim, run: w.run + 1 }
            : w,
        ),
      );
      return;
    }

    setPages((prev) =>
      prev.map((page) => {
        const isCurrent = page.id === currentPageId;

        const pageWords =
          page.words.length > 0
            ? page.words
            : page.rawText
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map((text) => ({
                  id: newWordId(),
                  text,
                  animation: null,
                  run: 0,
                }));

        const pageTargets = getEmotionMatchIdsInWords(pageWords, animationKey);
        if (isCurrent) selectedIds.forEach((id) => pageTargets.add(id));
        if (pageTargets.size === 0 && pageWords === page.words) return page;

        return {
          ...page,
          words: pageWords.map((w) =>
            pageTargets.has(w.id)
              ? { ...w, animation: nextAnim, run: w.run + 1 }
              : w,
          ),
        };
      }),
    );
  }

  function clearAnimations() {
    setCurrentPageWords((prev) =>
      prev.map((w) =>
        selectedIds.has(w.id) ? { ...w, animation: null, run: w.run + 1 } : w,
      ),
    );
  }

  // Ollama-backed rewrite flow (request/accept/reject + its loading state).
  const {
    pendingRewrite,
    rewriteLoading,
    rewriteError,
    loadingAnim,
    rewritingPageIds,
    requestRewrite,
    acceptRewrite,
    rejectRewrite,
    setPendingRewrite,
  } = useRewrite({
    pages,
    setPages,
    currentPage,
    scope,
    intensity,
    setSelectedIds,
  });

  // Ollama-backed refactor flow: rewrite a user-selected range of the
  // current page's text, guided by a typed instruction.
  const {
    refactorPrompt,
    setRefactorPrompt,
    pendingRefactor,
    refactorLoading,
    refactorError,
    requestRefactor,
    acceptRefactor,
    rejectRefactor,
    setPendingRefactor,
  } = useRefactor({
    pages,
    setPages,
    currentPage,
    currentPageId,
    scope,
    selection,
    setSelection,
  });

  function triggerAnimationAction(animationKey) {
    if (mode === "rewrite") requestRewrite(animationKey);
    else applyAnimation(animationKey);
  }

  function toggleRefactorArm(tool) {
    setRefactorTool((current) => (current === tool ? null : tool));
  }

  function submitRefactor() {
    setRefactorAnimStyle(refactorTool ?? "ripple");
    requestRefactor();
    setRefactorTool(null);
  }

  function cancelRefactorSelection() {
    setSelection(null);
    setRefactorTool(null);
  }

  function isAnimationDisabled(animationKey) {
    if (rewriteLoading) return true;
    if (mode === "rewrite") {
      const hasText =
        currentPage.words.length > 0 || currentPage.rawText.trim().length > 0;
      return !hasText || !EMOTION_WORD_LISTS[animationKey];
    }
    if (selectedIds.size > 0) return false;
    return !EMOTION_WORD_LISTS[animationKey];
  }

  // Drag an animation button onto the word canvas to trigger it.
  const { dragState, startGifDrag } = useGifDrag(triggerAnimationAction);

  // Whichever AI flow currently has a suggestion ready, keyed by page id —
  // shown as a diff preview in that page's thumbnail too.
  const pendingDiffsByPage =
    pendingRewrite?.diffsByPage ?? pendingRefactor?.diffsByPage ?? null;

  return (
    <div className="app">
      {showStartupModal && (
        <StartupModal
          onSelectText={loadDocumentText}
          onStartEmpty={startEmptyDocument}
          onCancel={() => setShowStartupModal(false)}
        />
      )}
      <header className="app-header">
        <div>
          <h1>Word Animator</h1>
          <p>
            Write text, split it into words, select words, apply an
            animation.
          </p>
        </div>
        <button className="btn btn-header-action" onClick={openStartupModal}>
          New / Import Document
        </button>
      </header>

      <main className="layout">
        <PagesRail
          pages={pages}
          currentPageId={currentPageId}
          draggingPageId={draggingPageId}
          rewritingPageIds={rewritingPageIds}
          rippleActive={
            scope === "global" &&
            refactorLoading &&
            refactorAnimStyle === "ripple"
          }
          barsActive={
            scope === "global" &&
            refactorLoading &&
            refactorAnimStyle === "bars"
          }
          pendingDiffsByPage={pendingDiffsByPage}
          loadingAnim={loadingAnim}
          intensity={intensity}
          intensityToDuration={intensityToDuration}
          registerPageRef={registerPageRef}
          dragMovedRef={dragMovedRef}
          onPageDragStart={startPageDrag}
          onSwitchPage={switchPage}
          onDeletePage={deletePage}
          onAddPage={addPage}
        />

        <EditorPane
          rewriteLoading={rewriteLoading}
          loadingAnim={loadingAnim}
          pendingRewrite={pendingRewrite}
          scope={scope}
          currentPageId={currentPageId}
          onAcceptRewrite={acceptRewrite}
          onRejectRewrite={rejectRewrite}
          isSearchMode={isSearchMode}
          intensity={intensity}
          intensityToDuration={intensityToDuration}
          currentPage={currentPage}
          selectedIds={selectedIds}
          onToggleWord={toggleWord}
          onChangeText={updateCurrentPageText}
          rewriteError={rewriteError}
          selection={selection}
          onSelectionChange={setSelection}
          refactorArmed={!!refactorTool}
          refactorAnimStyle={refactorAnimStyle}
          onCancelRefactor={cancelRefactorSelection}
          refactorPrompt={refactorPrompt}
          onSetRefactorPrompt={setRefactorPrompt}
          pendingRefactor={pendingRefactor}
          refactorLoading={refactorLoading}
          refactorError={refactorError}
          onRequestRefactor={submitRefactor}
          onAcceptRefactor={acceptRefactor}
          onRejectRefactor={rejectRefactor}
        />

        <ControlsPane
          mode={mode}
          onSwitchMode={switchMode}
          scope={scope}
          onSetScope={setScope}
          intensity={intensity}
          onSetIntensity={setIntensity}
          isAnimationDisabled={isAnimationDisabled}
          refactorTool={refactorTool}
          refactorLoading={refactorLoading}
          onToggleRefactorArm={toggleRefactorArm}
          onTriggerAnimation={triggerAnimationAction}
          onStartGifDrag={startGifDrag}
          selectedIds={selectedIds}
          onClearAnimations={clearAnimations}
        />
      </main>

      <DragGhost dragState={dragState} />
    </div>
  );
}

export default App;
