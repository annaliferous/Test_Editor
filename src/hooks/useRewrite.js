import { useState } from "react";
import { ANIMATIONS } from "../data/animations";
import { diffWords } from "../utils/wordDiff";
import { intensityToDescriptor } from "../utils/animationMath";
import { newWordId } from "../utils/ids";

// Drives the "Rewrite" flow: sends the current page (or all pages, in
// global scope) to a local Ollama model asking it to rewrite the text
// toward a target emotion/intensity, diffs the result against the
// original, and exposes accept/reject to commit or discard it.
export function useRewrite({
  pages,
  setPages,
  currentPage,
  scope,
  intensity,
  setSelectedIds,
}) {
  const [pendingRewrite, setPendingRewrite] = useState(null);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);
  const [loadingAnim, setLoadingAnim] = useState(null);
  const [rewritingPageIds, setRewritingPageIds] = useState(new Set());

  async function requestRewrite(animationKey) {
    const anim = ANIMATIONS.find((a) => a.key === animationKey);
    const emotionLabel = anim?.label || animationKey;
    const level = intensity[animationKey] ?? 50;
    const descriptor = intensityToDescriptor(level);

    const targetPages = scope === "global" ? pages : [currentPage];

    setRewriteLoading(true);
    setLoadingAnim(anim);
    setRewriteError(null);
    setPendingRewrite(null);
    setRewritingPageIds(new Set(targetPages.map((p) => p.id)));

    try {
      const results = await Promise.all(
        targetPages.map(async (page) => {
          const originalText = (
            page.words.length > 0
              ? page.words.map((w) => w.text).join(" ")
              : page.rawText
          ).trim();

          if (!originalText) return { pageId: page.id, diff: [] };

          const res = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "llama3",
              stream: false,
              messages: [
                {
                  role: "system",
                  content:
                    `Rewrite the user's text so it more strongly conveys the emotion "${emotionLabel}" ${descriptor} (intensity ${level}/100). ` +
                    `Preserve the original meaning and roughly the same length/word count. ` +
                    `Respond with ONLY the rewritten text, no preamble, no quotes.`,
                },
                { role: "user", content: originalText },
              ],
            }),
          });

          if (!res.ok) throw new Error(`Ollama request failed (${res.status})`);
          const data = await res.json();
          const rewrittenText = data?.message?.content?.trim();
          if (!rewrittenText) throw new Error("Ollama returned no content");

          const diff = diffWords(originalText, rewrittenText);
          // clear this page's "in progress" flag as soon as its own
          // request finishes, so thumbnails settle one by one
          setRewritingPageIds((prev) => {
            const next = new Set(prev);
            next.delete(page.id);
            return next;
          });
          return { pageId: page.id, diff };
        }),
      );

      const diffsByPage = {};
      results.forEach((r) => {
        diffsByPage[r.pageId] = r.diff;
      });

      setPendingRewrite({ emotion: animationKey, diffsByPage });
    } catch (err) {
      setRewriteError(
        err.message.includes("fetch")
          ? "Couldn't reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?"
          : err.message,
      );
    } finally {
      setRewriteLoading(false);
      setLoadingAnim(null);
      setRewritingPageIds(new Set());
    }
  }

  function acceptRewrite() {
    if (!pendingRewrite) return;
    setPages((prev) =>
      prev.map((page) => {
        const diff = pendingRewrite.diffsByPage[page.id];
        if (!diff) return page;
        const newWords = diff
          .filter((d) => d.type !== "remove")
          .map((d) => ({
            id: newWordId(),
            text: d.text,
            animation: null,
            run: 0,
          }));
        return { ...page, words: newWords };
      }),
    );
    setSelectedIds(new Set());
    setPendingRewrite(null);
  }

  function rejectRewrite() {
    setPendingRewrite(null);
  }

  return {
    pendingRewrite,
    rewriteLoading,
    rewriteError,
    loadingAnim,
    rewritingPageIds,
    requestRewrite,
    acceptRewrite,
    rejectRewrite,
    // exposed so callers (e.g. switching/deleting a page) can dismiss an
    // in-progress preview without going through rejectRewrite's semantics
    setPendingRewrite,
  };
}
