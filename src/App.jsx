import { useState } from "react";
import "./App.css";

import {
  makePage,
  makePagesFromText,
  splitTextIntoChunks,
  DEFAULT_MAX_PAGE_CHARS,
} from "./utils/pages";

import { usePageDrag } from "./hooks/usePageDrag";
import { useConsistencyCheck } from "./hooks/useConsistencyCheck";

import PagesRail from "./components/PagesRail";
import EditorPane from "./components/EditorPane";
import ControlsPane from "./components/ControlsPane";
import StartupModal from "./components/StartupModal";

function App() {
  // ---- Core document state: pages and the active page ----
  // Starts as a single empty page; the startup modal below lets the user
  // replace it with an uploaded file or the sample text before they start
  // editing, or just dismiss it and keep writing from scratch.
  const [pages, setPages] = useState([makePage("")]);
  const [currentPageId, setCurrentPageId] = useState(pages[0].id);
  const currentPage = pages.find((p) => p.id === currentPageId) ?? pages[0];

  const [scope, setScope] = useState("local"); // "local" | "global"
  // Range selected in the editor textarea, for the consistency-check flow:
  // { start, end, text }, relative to currentPage.rawText. Null when
  // nothing is selected.
  const [selection, setSelection] = useState(null);
  // Which quill tool is "armed" (null | "ai" | "random"): only while armed
  // does selecting text in the textarea show the quill cursor and pop up
  // the "check for inconsistencies" trigger. Two buttons share this same
  // flow — "ai" asks Ollama for real; "random" instantly flags a few random
  // spans instead, for testing the UI without waiting on a slow prompt.
  const [checkTool, setCheckTool] = useState(null);
  // Shown on first load, so the user can choose how to start the document.
  const [showStartupModal, setShowStartupModal] = useState(true);
  // "Halo"-style off-screen cues: small arc indicators at the editor's
  // edges pointing toward flagged inconsistencies that are out of view —
  // either scrolled past within the current page, or living on a
  // different page entirely. Opt-in visualization, off by default.
  const [haloCuesEnabled, setHaloCuesEnabled] = useState(false);

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

  function switchPage(pageId) {
    setCurrentPageId(pageId);
    // Deliberately NOT clearing pendingCheck here: a consistency check's
    // flagged spans should stay visible (in both the editor and the page
    // thumbnails) as the user navigates between pages, until they dismiss
    // it or start a new check.
    setSelection(null);
    setCheckTool(null);
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

  // Ollama-backed consistency-check flow: the quill flags inconsistent
  // spans in a user-selected range (local) or the whole document (global)
  // instead of rewriting anything.
  const {
    pendingCheck,
    checkLoading,
    checkError,
    requestCheck,
    requestRandomCheck,
    acceptIssue,
    dismissIssue,
    acceptAllCheck,
    dismissAllCheck,
  } = useConsistencyCheck({
    pages,
    currentPageId,
    scope,
    selection,
    setSelection,
  });

  function toggleCheckArm(tool) {
    setCheckTool((current) => (current === tool ? null : tool));
  }

  function submitCheck() {
    if (checkTool === "random") requestRandomCheck();
    else requestCheck();
    setCheckTool(null);
  }

  function cancelCheckSelection() {
    setSelection(null);
    setCheckTool(null);
  }

  function toggleHaloCues() {
    setHaloCuesEnabled((enabled) => !enabled);
  }

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
          <p>Write text and check it for inconsistencies.</p>
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
          issuesByPage={pendingCheck?.issuesByPage ?? null}
          registerPageRef={registerPageRef}
          dragMovedRef={dragMovedRef}
          onPageDragStart={startPageDrag}
          onSwitchPage={switchPage}
          onDeletePage={deletePage}
          onAddPage={addPage}
          haloCuesEnabled={haloCuesEnabled}
        />

        <EditorPane
          currentPageId={currentPageId}
          currentPage={currentPage}
          onChangeText={updateCurrentPageText}
          selection={selection}
          onSelectionChange={setSelection}
          checkArmed={!!checkTool}
          onCancelCheck={cancelCheckSelection}
          pendingCheck={pendingCheck}
          checkLoading={checkLoading}
          checkError={checkError}
          onRequestCheck={submitCheck}
          onAcceptIssue={acceptIssue}
          onDismissIssue={dismissIssue}
          onAcceptAllCheck={acceptAllCheck}
          onDismissAllCheck={dismissAllCheck}
          haloCuesEnabled={haloCuesEnabled}
        />

        <ControlsPane
          scope={scope}
          onSetScope={setScope}
          checkTool={checkTool}
          checkLoading={checkLoading}
          onToggleCheckArm={toggleCheckArm}
          haloCuesEnabled={haloCuesEnabled}
          onToggleHaloCues={toggleHaloCues}
          hasPendingCheck={!!pendingCheck}
        />
      </main>
    </div>
  );
}

export default App;
