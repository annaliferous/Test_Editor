import { useState } from "react";
import { locateIssues } from "../utils/textHighlight";

const OLLAMA_URL = "http://localhost:11434/api/chat";

async function askOllamaForIssues(systemPrompt, userText) {
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
  return parseIssuesJson(text);
}

function parseIssuesJson(text) {
  // Strip a ```json ... ``` (or bare ```) fence if the model wrapped its
  // answer in one despite being asked not to.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1] : text;
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Couldn't parse the consistency check results");
  }
  if (!Array.isArray(parsed)) throw new Error("Unexpected response format");
  return parsed.filter((item) => item && typeof item.text === "string");
}

// Picks a handful of random words out of `text` and flags them as fake
// "issues" — no AI involved. Used by the random test-check quill so the
// highlighting UI can be exercised instantly instead of waiting on a slow
// Ollama round-trip.
function pickRandomIssues(text) {
  const words = text.match(/\S+/g) || [];
  if (words.length === 0) return [];

  const count = Math.min(words.length, 1 + Math.floor(Math.random() * 3));
  const chosenIndexes = new Set();
  while (chosenIndexes.size < count) {
    chosenIndexes.add(Math.floor(Math.random() * words.length));
  }

  return [...chosenIndexes].map((i) => ({
    text: words[i].replace(/^[.,!?;:"'()]+|[.,!?;:"'()]+$/g, ""),
    reason: "Random test flag (no AI used)",
  }));
}

const LOCAL_SYSTEM_PROMPT =
  "You are a careful editor reviewing a passage for internal inconsistencies — " +
  "contradictions, conflicting facts, mismatched names/dates/details, or abrupt tone shifts. " +
  "Find ONLY genuine inconsistencies within the passage below. " +
  'Respond with ONLY a JSON array (no markdown, no preamble), where each item is {"text": "<exact substring copied verbatim from the passage>", "reason": "<short reason>"}. ' +
  "If there are none, respond with exactly [].";

const GLOBAL_SYSTEM_PROMPT =
  "You are a careful editor reviewing a multi-page document for inconsistencies — " +
  "contradictions, conflicting facts, mismatched names/dates/details, or abrupt tone shifts, " +
  "whether within one page or across pages. " +
  'Respond with ONLY a JSON array (no markdown, no preamble), where each item is {"page": <1-based page number where the text appears>, "text": "<exact substring copied verbatim from that page>", "reason": "<short reason>"}. ' +
  "If there are none, respond with exactly [].";

// Drives the quill's consistency-check flow: instead of rewriting text
// toward an instruction, it flags inconsistent spans for review. "local"
// scope checks only the highlighted selection; "global" checks every
// page. There is nothing to accept — issues are read-only highlights,
// cleared by dismissing or by the underlying text changing.
export function useConsistencyCheck({
  pages,
  currentPageId,
  scope,
  selection,
  setSelection,
}) {
  const [pendingCheck, setPendingCheck] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkError, setCheckError] = useState(null);

  async function requestCheck() {
    if (!selection || checkLoading) return;

    setCheckLoading(true);
    setCheckError(null);
    setPendingCheck(null);

    try {
      if (scope === "local") {
        const issues = await askOllamaForIssues(
          LOCAL_SYSTEM_PROMPT,
          selection.text,
        );
        const currentPage = pages.find((p) => p.id === currentPageId);
        const located = locateIssues(currentPage?.rawText ?? "", issues, {
          start: selection.start,
          end: selection.end,
        });
        setPendingCheck({
          scope: "local",
          issuesByPage: { [currentPageId]: located },
        });
      } else {
        const labeled = pages
          .map((p, i) => `--- Page ${i + 1} ---\n${p.rawText.trim()}`)
          .join("\n\n");

        const issues = labeled.trim()
          ? await askOllamaForIssues(GLOBAL_SYSTEM_PROMPT, labeled)
          : [];

        const issuesByPageNum = {};
        issues.forEach((issue) => {
          const pageNum = issue.page;
          if (!issuesByPageNum[pageNum]) issuesByPageNum[pageNum] = [];
          issuesByPageNum[pageNum].push(issue);
        });

        const issuesByPage = {};
        pages.forEach((page, idx) => {
          const pageIssues = issuesByPageNum[idx + 1];
          if (!pageIssues) return;
          issuesByPage[page.id] = locateIssues(page.rawText, pageIssues);
        });

        setPendingCheck({ scope: "global", issuesByPage });
      }
    } catch (err) {
      setCheckError(
        err.message.includes("fetch")
          ? "Couldn't reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?"
          : err.message,
      );
    } finally {
      setCheckLoading(false);
    }
  }

  // Same shape as requestCheck, but synchronous and random — for testing
  // the highlight UI without waiting on a real (slow) prompt.
  function requestRandomCheck() {
    if (!selection) return;

    setCheckError(null);

    if (scope === "local") {
      const currentPage = pages.find((p) => p.id === currentPageId);
      const issues = pickRandomIssues(selection.text);
      const located = locateIssues(currentPage?.rawText ?? "", issues, {
        start: selection.start,
        end: selection.end,
      });
      setPendingCheck({
        scope: "local",
        issuesByPage: { [currentPageId]: located },
      });
    } else {
      const issuesByPage = {};
      pages.forEach((page) => {
        if (!page.rawText.trim()) return;
        const issues = pickRandomIssues(page.rawText);
        if (issues.length === 0) return;
        issuesByPage[page.id] = locateIssues(page.rawText, issues);
      });
      setPendingCheck({ scope: "global", issuesByPage });
    }
  }

  // Resolves a single flagged span (hovering over it in the editor offers
  // both an Accept and a Dismiss action) — either way it's removed from
  // the pending list; there's no AI-suggested fix to actually apply, so
  // the two only differ in what the user means by resolving it.
  function removeIssue(pageId, issueIndex) {
    setPendingCheck((prev) => {
      if (!prev) return prev;
      const pageIssues = prev.issuesByPage[pageId] || [];
      return {
        ...prev,
        issuesByPage: {
          ...prev.issuesByPage,
          [pageId]: pageIssues.filter((_, i) => i !== issueIndex),
        },
      };
    });
  }

  function acceptIssue(pageId, issueIndex) {
    removeIssue(pageId, issueIndex);
  }

  function dismissIssue(pageId, issueIndex) {
    removeIssue(pageId, issueIndex);
  }

  function acceptAllCheck() {
    setPendingCheck(null);
    setSelection(null);
  }

  function dismissAllCheck() {
    setPendingCheck(null);
    setSelection(null);
  }

  return {
    pendingCheck,
    checkLoading,
    checkError,
    requestCheck,
    requestRandomCheck,
    acceptIssue,
    dismissIssue,
    acceptAllCheck,
    dismissAllCheck,
    setPendingCheck,
  };
}
