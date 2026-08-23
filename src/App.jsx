import { useCallback, useMemo, useState } from "react";
import "./App.css";

import {
  makePage,
  makePagesFromText,
  splitTextIntoChunks,
  DEFAULT_MAX_PAGE_CHARS,
} from "./utils/pages";
import {
  computePageStartOffsets,
  trailSizePx,
  TRAIL_ANCHOR_SIZE,
  TIME_ICON_SIZE,
} from "./utils/trailScale";

import { usePageDrag } from "./hooks/usePageDrag";
import { useLocationRewrite } from "./hooks/useLocationRewrite";

import PagesRail from "./components/PagesRail";
import EditorPane from "./components/EditorPane";
import ControlsPane from "./components/ControlsPane";
import StartupModal from "./components/StartupModal";
import LocationLines from "./components/LocationLines";
import DistanceMarkerAnimator from "./components/DistanceMarkerAnimator";

function pinsEqual(a = {}, b = {}) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => b[k] && a[k].x === b[k].x && a[k].y === b[k].y);
}

function renderTrailMarker(shown) {
  return (
    <div
      className="trail-marker"
      style={{ left: shown.x, top: shown.y, fontSize: shown.size, opacity: shown.opacity ?? 1 }}
      aria-hidden="true"
    >
      📍
    </div>
  );
}

function renderTimeMarker(shown) {
  return (
    <div
      className="trail-marker time-marker"
      style={{
        left: shown.x,
        top: shown.y,
        width: shown.size,
        height: shown.size,
        opacity: shown.opacity ?? 1,
        "--time-fill": shown.fraction ?? 0,
      }}
      aria-hidden="true"
    />
  );
}

const trailSizeForFraction = (t, isAnchor) => (isAnchor ? TRAIL_ANCHOR_SIZE : trailSizePx(t));
const timeSizeForFraction = () => TIME_ICON_SIZE;

function App() {
  // ---- Core document state: pages and the active page ----
  // Starts as a single empty page; the startup modal below lets the user
  // replace it with an uploaded file or the sample text before they start
  // editing, or just dismiss it and keep writing from scratch.
  const [pages, setPages] = useState([makePage("")]);
  const [currentPageId, setCurrentPageId] = useState(pages[0].id);
  const currentPage = pages.find((p) => p.id === currentPageId) ?? pages[0];

  const [scope, setScope] = useState("local"); // "local" | "global"
  // Range selected in the editor textarea, for whichever location tool is
  // armed: { start, end, text }, relative to currentPage.rawText. Null when
  // nothing is selected. Shared by all three tools below since only one
  // can be armed (and reviewed) at a time.
  const [selection, setSelection] = useState(null);
  // Which quill tool is armed: null, or "<pin|trail|time>-<ai|random>".
  // Only while armed does selecting text in the textarea show a marker
  // cursor and pop up the "drop marker & find other mentions" trigger.
  const [armedTool, setArmedTool] = useState(null);
  const armedKind = armedTool ? armedTool.split("-")[0] : null; // "pin" | "trail" | "time" | null
  // Shown on first load, so the user can choose how to start the document.
  const [showStartupModal, setShowStartupModal] = useState(true);
  // "Halo"-style off-screen cues: small ring indicators at the editor's and
  // rail's edges pointing toward location pins that are out of view —
  // either scrolled past within the current page, or living on a
  // different page entirely. Only meaningful for the pin tool. Opt-in
  // visualization, off by default.
  const [haloCuesEnabled, setHaloCuesEnabled] = useState(false);

  // How the trail tool's marker size falls off with distance from the
  // anchor: "both" directions through the document, or "forward" only
  // (mentions earlier than the anchor stay full size).
  const [trailDistanceMode, setTrailDistanceMode] = useState("both");
  // Bumped by the ▶ Play travel button to trigger the trail tool's
  // one-time travel animation on demand. The scroll-linked "you are here"
  // marker it reports below is what shows the rest of the time.
  const [trailPlayRequestId, setTrailPlayRequestId] = useState(0);
  const playTrailAnimation = useCallback(
    () => setTrailPlayRequestId((id) => id + 1),
    [],
  );
  // The trail tool's live "you are here" marker — whichever pinned word on
  // the current page sits closest to the middle of the visible text right
  // now, reported by EditorPane as the user scrolls.
  const [trailScrollMarker, setTrailScrollMarker] = useState(null);

  // Same distance-mode setting again, for the time tool — independent
  // state, since only one of the two can ever be under review at once but
  // each remembers its own preference regardless. (Travel mode for both
  // tools' animations is derived straight from Scope below — a local
  // search never has anything on another page to travel to anyway.)
  const [timeDistanceMode, setTimeDistanceMode] = useState("both");
  const [timePlayRequestId, setTimePlayRequestId] = useState(0);
  const playTimeAnimation = useCallback(
    () => setTimePlayRequestId((id) => id + 1),
    [],
  );
  const [timeScrollMarker, setTimeScrollMarker] = useState(null);

  // Screen positions of every currently-visible PIN-tool marker (the
  // anchor plus each found match), reported by whichever pane currently
  // renders it — the editor for the current page, or that page's own
  // thumbnail in the rail otherwise — keyed by an independent source so
  // one reporter's update never clobbers another's. LocationLines merges
  // these into the seethrough connecting line(s). The trail and time
  // tools don't use this — their markers communicate distance by
  // appearance, not a line.
  const [pinsBySource, setPinsBySource] = useState({});
  const reportPins = useCallback((sourceKey, pins) => {
    setPinsBySource((prev) => {
      if (pinsEqual(prev[sourceKey], pins)) return prev;
      return { ...prev, [sourceKey]: pins };
    });
  }, []);
  const reportEditorPins = useCallback(
    (pins) => reportPins("editor", pins),
    [reportPins],
  );

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
    // Deliberately NOT clearing any tool's pendingRewrite here: markers
    // should stay put (in both the editor and the page thumbnails) as the
    // user navigates between pages, until they dismiss them or start over.
    setSelection(null);
    setArmedTool(null);
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

  // Three independent instances of the same underlying flow: drop a
  // marker on a selected passage (the anchor), find every other passage
  // (in scope) that refers to the same thing, then review each one
  // individually. "pin" visualizes off-screen matches with the halo/line
  // cues; "trail" sizes every marker by how far it sits from the anchor
  // through the whole document; "time" fills a stopwatch the same way,
  // for spotting time inconsistencies instead of location ones. Only one
  // is ever under review at a time — starting one clears the other two
  // (see submitRewrite below).
  const pins = useLocationRewrite({
    kind: "pin",
    pages,
    updatePage,
    currentPageId,
    scope,
    selection,
    setSelection,
  });
  const trail = useLocationRewrite({
    kind: "trail",
    pages,
    updatePage,
    currentPageId,
    scope,
    selection,
    setSelection,
  });
  const time = useLocationRewrite({
    kind: "time",
    pages,
    updatePage,
    currentPageId,
    scope,
    selection,
    setSelection,
  });
  const pendingRewrite = pins.pendingRewrite ?? trail.pendingRewrite ?? time.pendingRewrite;
  const rewriteLoading = pins.rewriteLoading || trail.rewriteLoading || time.rewriteLoading;
  const rewriteError = pins.rewriteError ?? trail.rewriteError ?? time.rewriteError;
  // Whichever hook actually holds the pending review no-ops the other
  // two's calls internally (they bail out when their own state is null),
  // so callbacks can just fan out to all three without checking which is
  // active.
  function acceptMatch(pageId, matchIndex) {
    pins.acceptMatch(pageId, matchIndex);
    trail.acceptMatch(pageId, matchIndex);
    time.acceptMatch(pageId, matchIndex);
  }
  function dismissMatch(pageId, matchIndex) {
    pins.dismissMatch(pageId, matchIndex);
    trail.dismissMatch(pageId, matchIndex);
    time.dismissMatch(pageId, matchIndex);
  }
  function renameAnchor(newName) {
    pins.renameAnchor(newName);
    trail.renameAnchor(newName);
    time.renameAnchor(newName);
  }
  function acceptAllRewrite() {
    pins.acceptAllRewrite();
    trail.acceptAllRewrite();
    time.acceptAllRewrite();
  }
  function dismissAllRewrite() {
    pins.dismissAllRewrite();
    trail.dismissAllRewrite();
    time.dismissAllRewrite();
  }

  const hooksByKind = { pin: pins, trail, time };

  function toggleArm(tool) {
    setArmedTool((current) => (current === tool ? null : tool));
  }

  function submitRewrite() {
    const [kind, mode] = (armedTool ?? "").split("-");
    const active = hooksByKind[kind];
    if (!active) return;
    Object.entries(hooksByKind).forEach(([k, hook]) => {
      if (k !== kind) hook.setPendingRewrite(null);
    });
    if (mode === "random") active.requestRandomRewrite();
    else active.requestRewrite();
    setArmedTool(null);
  }

  function cancelRewriteSelection() {
    setSelection(null);
    setArmedTool(null);
  }

  function toggleHaloCues() {
    setHaloCuesEnabled((enabled) => !enabled);
  }

  // Prefix-sum character offsets for every page in whole-document reading
  // order, plus the document's total length — used by the trail and time
  // tools to size/fill each marker by how far through the document it sits.
  const { pageStartOffsets, totalDocLength } = useMemo(
    () => computePageStartOffsets(pages),
    [pages],
  );

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
          <p>Write text and pin its locations for consistency.</p>
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
          pendingRewrite={pendingRewrite}
          pageStartOffsets={pageStartOffsets}
          totalDocLength={totalDocLength}
          trailDistanceMode={trailDistanceMode}
          timeDistanceMode={timeDistanceMode}
          registerPageRef={registerPageRef}
          dragMovedRef={dragMovedRef}
          onPageDragStart={startPageDrag}
          onSwitchPage={switchPage}
          onDeletePage={deletePage}
          onAddPage={addPage}
          haloCuesEnabled={haloCuesEnabled}
          onReportPins={reportPins}
        />

        <EditorPane
          currentPageId={currentPageId}
          currentPage={currentPage}
          onChangeText={updateCurrentPageText}
          selection={selection}
          onSelectionChange={setSelection}
          armedKind={armedKind}
          onCancelRewrite={cancelRewriteSelection}
          pendingRewrite={pendingRewrite}
          rewriteLoading={rewriteLoading}
          rewriteError={rewriteError}
          onRequestRewrite={submitRewrite}
          onAcceptMatch={acceptMatch}
          onDismissMatch={dismissMatch}
          onRenameAnchor={renameAnchor}
          onAcceptAllRewrite={acceptAllRewrite}
          onDismissAllRewrite={dismissAllRewrite}
          haloCuesEnabled={haloCuesEnabled}
          onReportPins={reportEditorPins}
          pageStartOffsets={pageStartOffsets}
          totalDocLength={totalDocLength}
          trailDistanceMode={trailDistanceMode}
          onTrailScrollMarker={setTrailScrollMarker}
          onPlayTrailAnimation={playTrailAnimation}
          timeDistanceMode={timeDistanceMode}
          onTimeScrollMarker={setTimeScrollMarker}
          onPlayTimeAnimation={playTimeAnimation}
        />

        <ControlsPane
          scope={scope}
          onSetScope={setScope}
          armedTool={armedTool}
          rewriteLoading={rewriteLoading}
          onToggleArm={toggleArm}
          haloCuesEnabled={haloCuesEnabled}
          onToggleHaloCues={toggleHaloCues}
          hasPendingPins={!!pins.pendingRewrite}
          trailDistanceMode={trailDistanceMode}
          onSetTrailDistanceMode={setTrailDistanceMode}
          timeDistanceMode={timeDistanceMode}
          onSetTimeDistanceMode={setTimeDistanceMode}
        />
      </main>

      <LocationLines pendingRewrite={pins.pendingRewrite} pinsBySource={pinsBySource} />
      <DistanceMarkerAnimator
        pendingRewrite={trail.pendingRewrite}
        anchorSelector=".location-trail-anchor"
        matchSelector=".location-trail-match"
        pages={pages}
        currentPageId={currentPageId}
        onSwitchPage={switchPage}
        pageStartOffsets={pageStartOffsets}
        totalDocLength={totalDocLength}
        distanceMode={trailDistanceMode}
        playRequestId={trailPlayRequestId}
        scrollMarker={trailScrollMarker}
        sizeForFraction={trailSizeForFraction}
        renderMarker={renderTrailMarker}
      />
      <DistanceMarkerAnimator
        pendingRewrite={time.pendingRewrite}
        anchorSelector=".location-time-anchor"
        matchSelector=".location-time-match"
        pages={pages}
        currentPageId={currentPageId}
        onSwitchPage={switchPage}
        pageStartOffsets={pageStartOffsets}
        totalDocLength={totalDocLength}
        distanceMode={timeDistanceMode}
        playRequestId={timePlayRequestId}
        scrollMarker={timeScrollMarker}
        sizeForFraction={timeSizeForFraction}
        renderMarker={renderTimeMarker}
      />
    </div>
  );
}

export default App;
