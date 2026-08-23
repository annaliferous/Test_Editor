import { useState } from "react";
import { locateIssues } from "../utils/textHighlight";

const OLLAMA_URL = "http://localhost:11434/api/chat";

async function askOllamaForMatches(systemPrompt, userText) {
  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed (${res.status})`);
  const data = await res.json();
  const text = data?.message?.content?.trim();
  if (!text) throw new Error("Ollama returned no content");
  return parseMatchesJson(text);
}

function parseMatchesJson(text) {
  // Strip a ```json ... ``` (or bare ```) fence if the model wrapped its
  // answer in one despite being asked not to.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1] : text;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Couldn't parse the location search results");
  }
  if (!Array.isArray(parsed)) throw new Error("Unexpected response format");
  return parsed.filter((item) => item && typeof item.text === "string");
}

// Picks a handful of random words elsewhere in `text` and pretends they
// name the same location — no AI involved. Used by the random test-tool so
// the pin/line UI can be exercised instantly instead of waiting on a slow
// Ollama round-trip.
function pickRandomMatches(text, anchorName) {
  const words = text.match(/\S+/g) || [];
  const candidates = words.filter(
    (w) => w.toLowerCase() !== anchorName?.toLowerCase(),
  );
  if (candidates.length === 0) return [];

  const count = Math.min(candidates.length, 1 + Math.floor(Math.random() * 3));
  const chosenIndexes = new Set();
  while (chosenIndexes.size < count) {
    chosenIndexes.add(Math.floor(Math.random() * candidates.length));
  }

  return [...chosenIndexes].map((i) => ({
    text: candidates[i].replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, ""),
  }));
}

// "pin" and "trail" both search for the same thing (other mentions of a
// location) and only differ in how they visualize the results; "time"
// searches for a different kind of thing entirely — other time references
// that might conflict with, or otherwise need to stay consistent with, the
// anchor's.
function subjectPhrase(kind, anchor) {
  if (kind === "time") {
    return (
      `a time reference: "${anchor}" (a date, duration, clock time, age, season, deadline, ` +
      'or relative marker like "three days later")'
    );
  }
  return `a location called "${anchor}" (possibly described differently elsewhere)`;
}

function whatToFind(kind, anchor) {
  if (kind === "time") {
    return (
      "also time references — especially ones that might conflict with or otherwise need to stay " +
      `consistent with "${anchor}"`
    );
  }
  return "also refer to this same location";
}

const LOCAL_SYSTEM_PROMPT = (kind, anchor) =>
  `You are a careful editor. The passage below contains ${subjectPhrase(kind, anchor)}. ` +
  `Find OTHER exact substrings in the passage — not the same occurrence — that ${whatToFind(kind, anchor)}. ` +
  'Respond with ONLY a JSON array (no markdown, no preamble), where each item is {"text": "<exact substring copied verbatim from the passage>"}. ' +
  "If there are none, respond with exactly [].";

const GLOBAL_SYSTEM_PROMPT = (kind, anchor) =>
  `You are a careful editor reviewing a multi-page document. It contains ${subjectPhrase(kind, anchor)}. ` +
  `Find OTHER exact substrings anywhere in the document — not the same occurrence — that ${whatToFind(kind, anchor)}, on any page. ` +
  'Respond with ONLY a JSON array (no markdown, no preamble), where each item is {"page": <1-based page number where the text appears>, "text": "<exact substring copied verbatim from that page>"}. ' +
  "If there are none, respond with exactly [].";

// Shifts a {start,end} span by `delta` if it starts at or after `cutoff` —
// used to keep every other span on a page valid after a same-page text
// edit changes the document's length at some earlier point.
function shiftSpan(span, cutoff, delta) {
  if (span.start < cutoff) return span;
  return { ...span, start: span.start + delta, end: span.end + delta };
}

function excludingAnchor(located, anchor, pageId) {
  if (pageId !== anchor.pageId) return located;
  return located.filter((m) => m.end <= anchor.start || m.start >= anchor.end);
}

// Drives a quill location tool: drop a marker on a selected place name
// (the anchor), then find every other passage — in scope — that refers to
// the same location. The anchor's text is directly editable in place;
// renaming it doesn't touch anything else. Each found match is reviewed
// individually — accepting rewrites that span to the anchor's current
// name, dismissing just clears its marker — mirroring the old per-issue
// flow. `kind` is stamped onto every pendingRewrite this produces (e.g.
// "pin" or "trail") purely so a shared consumer (EditorPane, thumbnails)
// can tell which of possibly several independent instances of this hook
// a given pendingRewrite came from, and render/behave accordingly.
export function useLocationRewrite({
  kind,
  pages,
  updatePage,
  currentPageId,
  scope,
  selection,
  setSelection,
}) {
  const [pendingRewrite, setPendingRewrite] = useState(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  async function requestRewrite() {
    if (!selection || rewriteLoading) return;
    const anchorName = selection.text.trim();
    if (!anchorName) return;

    setRewriteLoading(true);
    setRewriteError(null);
    setPendingRewrite(null);

    const anchor = {
      pageId: currentPageId,
      start: selection.start,
      end: selection.end,
      name: anchorName,
    };

    try {
      if (scope === "local") {
        const currentPage = pages.find((p) => p.id === currentPageId);
        const raw = currentPage?.rawText ?? "";
        const matches = await askOllamaForMatches(
          LOCAL_SYSTEM_PROMPT(kind, anchorName),
          raw,
        );
        const located = excludingAnchor(
          locateIssues(raw, matches),
          anchor,
          currentPageId,
        );
        setPendingRewrite({
          kind,
          scope: "local",
          anchor,
          matchesByPage: { [currentPageId]: located },
        });
      } else {
        const labeled = pages
          .map((p, i) => `--- Page ${i + 1} ---\n${p.rawText.trim()}`)
          .join("\n\n");
        const matches = labeled.trim()
          ? await askOllamaForMatches(GLOBAL_SYSTEM_PROMPT(kind, anchorName), labeled)
          : [];

        const matchesByPageNum = {};
        matches.forEach((m) => {
          if (!matchesByPageNum[m.page]) matchesByPageNum[m.page] = [];
          matchesByPageNum[m.page].push(m);
        });

        const matchesByPage = {};
        pages.forEach((page, idx) => {
          const pageMatches = matchesByPageNum[idx + 1];
          if (!pageMatches) return;
          const located = excludingAnchor(
            locateIssues(page.rawText, pageMatches),
            anchor,
            page.id,
          );
          if (located.length > 0) matchesByPage[page.id] = located;
        });

        setPendingRewrite({ kind, scope: "global", anchor, matchesByPage });
      }
    } catch (err) {
      setRewriteError(
        err.message.includes("fetch")
          ? "Couldn't reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?"
          : err.message,
      );
    } finally {
      setRewriteLoading(false);
    }
  }

  // Same shape as requestRewrite, but synchronous and random — for testing
  // the pin/line UI without waiting on a real (slow) prompt.
  function requestRandomRewrite() {
    if (!selection) return;
    const anchorName = selection.text.trim();
    if (!anchorName) return;

    setRewriteError(null);
    const anchor = {
      pageId: currentPageId,
      start: selection.start,
      end: selection.end,
      name: anchorName,
    };

    if (scope === "local") {
      const currentPage = pages.find((p) => p.id === currentPageId);
      const raw = currentPage?.rawText ?? "";
      const located = excludingAnchor(
        locateIssues(raw, pickRandomMatches(raw, anchorName)),
        anchor,
        currentPageId,
      );
      setPendingRewrite({
        kind,
        scope: "local",
        anchor,
        matchesByPage: { [currentPageId]: located },
      });
    } else {
      const matchesByPage = {};
      pages.forEach((page) => {
        if (!page.rawText.trim()) return;
        const matches = pickRandomMatches(page.rawText, anchorName);
        if (matches.length === 0) return;
        const located = excludingAnchor(
          locateIssues(page.rawText, matches),
          anchor,
          page.id,
        );
        if (located.length > 0) matchesByPage[page.id] = located;
      });
      setPendingRewrite({ kind, scope: "global", anchor, matchesByPage });
    }
  }

  function dismissMatch(pageId, matchIndex) {
    setPendingRewrite((prev) => {
      if (!prev) return prev;
      const pageMatches = prev.matchesByPage[pageId] || [];
      return {
        ...prev,
        matchesByPage: {
          ...prev.matchesByPage,
          [pageId]: pageMatches.filter((_, i) => i !== matchIndex),
        },
      };
    });
  }

  // Rewrites one matched span to the anchor's current name, then shifts
  // every later span on that same page (other matches, and the anchor
  // itself if it sits further down the same page) by the resulting length
  // delta so their offsets stay valid.
  function acceptMatch(pageId, matchIndex) {
    setPendingRewrite((prev) => {
      if (!prev) return prev;
      const pageMatches = prev.matchesByPage[pageId] || [];
      const match = pageMatches[matchIndex];
      const page = pages.find((p) => p.id === pageId);
      if (!match || !page) return prev;

      const { start, end } = match;
      const replacement = prev.anchor.name;
      const newText =
        page.rawText.slice(0, start) + replacement + page.rawText.slice(end);
      updatePage(pageId, () => ({ rawText: newText }));

      const delta = replacement.length - (end - start);
      const remaining = pageMatches
        .filter((_, i) => i !== matchIndex)
        .map((m) => shiftSpan(m, end, delta));
      const nextAnchor =
        prev.anchor.pageId === pageId
          ? shiftSpan(prev.anchor, end, delta)
          : prev.anchor;

      return {
        ...prev,
        anchor: nextAnchor,
        matchesByPage: { ...prev.matchesByPage, [pageId]: remaining },
      };
    });
  }

  // Commits an edit to the anchor's own text in place, then shifts any
  // matches on the same page that come after it by the resulting length
  // delta. Doesn't touch the matches' text — each is only rewritten when
  // individually accepted, using whatever the anchor's name is then.
  function renameAnchor(newName) {
    setPendingRewrite((prev) => {
      if (!prev) return prev;
      const trimmed = newName.trim();
      if (!trimmed || trimmed === prev.anchor.name) return prev;

      const { pageId, start, end } = prev.anchor;
      const page = pages.find((p) => p.id === pageId);
      if (!page) return prev;
      const newText =
        page.rawText.slice(0, start) + trimmed + page.rawText.slice(end);
      updatePage(pageId, () => ({ rawText: newText }));

      const delta = trimmed.length - (end - start);
      const pageMatches = prev.matchesByPage[pageId] || [];
      const shiftedMatches = pageMatches.map((m) => shiftSpan(m, end, delta));

      return {
        ...prev,
        anchor: { pageId, start, end: start + trimmed.length, name: trimmed },
        matchesByPage: { ...prev.matchesByPage, [pageId]: shiftedMatches },
      };
    });
  }

  function acceptAllRewrite() {
    setPendingRewrite((prev) => {
      if (!prev) return prev;
      // matchesByPage is a plain object, so Object.entries stringifies its
      // keys — but page ids are plain numbers (see utils/ids.js), so the
      // lookup below has to compare as strings rather than expect an
      // exact match, and the actual (correctly-typed) page.id has to be
      // used for the updatePage call rather than the stringified key.
      Object.entries(prev.matchesByPage).forEach(([pageIdKey, matches]) => {
        const page = pages.find((p) => String(p.id) === pageIdKey);
        if (!page || matches.length === 0) return;
        // Right-to-left so earlier offsets on this page stay valid as
        // later spans are rewritten.
        const ordered = [...matches].sort((a, b) => b.start - a.start);
        let text = page.rawText;
        ordered.forEach(({ start, end }) => {
          text = text.slice(0, start) + prev.anchor.name + text.slice(end);
        });
        updatePage(page.id, () => ({ rawText: text }));
      });
      return null;
    });
    setSelection(null);
  }

  function dismissAllRewrite() {
    setPendingRewrite(null);
    setSelection(null);
  }

  return {
    pendingRewrite,
    rewriteLoading,
    rewriteError,
    requestRewrite,
    requestRandomRewrite,
    acceptMatch,
    dismissMatch,
    renameAnchor,
    acceptAllRewrite,
    dismissAllRewrite,
    setPendingRewrite,
  };
}
