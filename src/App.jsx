import { useState, useEffect } from "react";
import "./App.css";

import { EMOTION_WORD_LISTS, getEmotionMatchIdsInWords } from "./data/animations";
import { makePage } from "./utils/pages";
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

function App() {
  // ---- Core document state: pages, the active page, and word selection ----
  const [pages, setPages] = useState([
    makePage(
      "I felt a deep affection and passion for this project. Also the bliss and happiness made me feel joy",
    ),
  ]);
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
  // Whether the Refactor tool is "armed": only while armed does selecting
  // text in the textarea show the quill cursor and pop up the instruction
  // prompt. Toggled by clicking the quill button.
  const [refactorArmed, setRefactorArmed] = useState(false);

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
    setRefactorArmed(false);
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
    updatePage(currentPageId, () => ({ rawText: text }));
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
    setRefactorArmed(false);
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

  function toggleRefactorArm() {
    setRefactorArmed((armed) => !armed);
  }

  function submitRefactor() {
    requestRefactor();
    setRefactorArmed(false);
  }

  function cancelRefactorSelection() {
    setSelection(null);
    setRefactorArmed(false);
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Word Animator</h1>
        <p>
          Write text, split it into words, select words, apply an animation.
        </p>
      </header>

      <main className="layout">
        <PagesRail
          pages={pages}
          currentPageId={currentPageId}
          draggingPageId={draggingPageId}
          rewritingPageIds={rewritingPageIds}
          rippleActive={scope === "global" && (rewriteLoading || refactorLoading)}
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
          refactorArmed={refactorArmed}
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
          refactorArmed={refactorArmed}
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
