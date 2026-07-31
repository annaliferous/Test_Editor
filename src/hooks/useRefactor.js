import { useState } from "react";
import { diffWords } from "../utils/wordDiff";

const OLLAMA_URL = "http://localhost:11434/api/chat";

async function askOllama(systemPrompt, userText) {
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
  return text;
}

function splitParagraphs(text) {
  return text.split(/\n{2,}/);
}

// Which paragraph index a character offset into the joined text falls in.
function paragraphIndexAtOffset(paragraphs, offset) {
  let pos = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const end = pos + paragraphs[i].length;
    if (offset <= end) return i;
    pos = end + 2; // skip the "\n\n" separator
  }
  return paragraphs.length - 1;
}

// Drives the "Refactor" flow: the user selects a range of text in the
// Rewrite-mode textarea and types an instruction. In "local" scope only the
// paragraph containing the selection is rewritten; in "global" scope every
// page's full text is rewritten, using the selection + instruction as the
// guiding context. Mirrors useRewrite's request/accept/reject shape.
export function useRefactor({
  pages,
  setPages,
  currentPage,
  currentPageId,
  scope,
  selection,
  setSelection,
}) {
  const [refactorPrompt, setRefactorPrompt] = useState("");
  const [pendingRefactor, setPendingRefactor] = useState(null);
  const [refactorLoading, setRefactorLoading] = useState(false);
  const [refactorError, setRefactorError] = useState(null);

  async function requestRefactor() {
    if (!selection || !refactorPrompt.trim() || refactorLoading) return;
    const instruction = refactorPrompt.trim();
    const selectedText = selection.text;

    setRefactorLoading(true);
    setRefactorError(null);
    setPendingRefactor(null);

    try {
      if (scope === "local") {
        const paragraphs = splitParagraphs(currentPage.rawText);
        const paragraphIndex = paragraphIndexAtOffset(
          paragraphs,
          selection.start,
        );
        const targetParagraph = paragraphs[paragraphIndex];

        const rewritten = await askOllama(
          `Rewrite the following paragraph based on this instruction: "${instruction}". ` +
            `The user highlighted this excerpt within the paragraph for context: "${selectedText}". ` +
            `Preserve the paragraph's core meaning. Respond with ONLY the rewritten paragraph, no preamble, no quotes.`,
          targetParagraph,
        );

        setPendingRefactor({
          scope: "local",
          paragraphs,
          paragraphIndex,
          diffsByPage: {
            [currentPageId]: diffWords(targetParagraph, rewritten),
          },
        });
      } else {
        const results = await Promise.all(
          pages.map(async (page) => {
            const originalText = page.rawText.trim();
            if (!originalText)
              return { pageId: page.id, diff: [], rewritten: "" };

            const rewritten = await askOllama(
              `Rewrite the user's entire text based on this instruction: "${instruction}". ` +
                `Use the following highlighted excerpt as context for the intent of the rewrite: "${selectedText}". ` +
                `Preserve the overall meaning and structure. Respond with ONLY the rewritten text, no preamble, no quotes.`,
              originalText,
            );
            return {
              pageId: page.id,
              diff: diffWords(originalText, rewritten),
              rewritten,
            };
          }),
        );

        const diffsByPage = {};
        const rewrittenByPage = {};
        results.forEach((r) => {
          diffsByPage[r.pageId] = r.diff;
          rewrittenByPage[r.pageId] = r.rewritten;
        });

        setPendingRefactor({ scope: "global", diffsByPage, rewrittenByPage });
      }
    } catch (err) {
      setRefactorError(
        err.message.includes("fetch")
          ? "Couldn't reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?"
          : err.message,
      );
    } finally {
      setRefactorLoading(false);
    }
  }

  function acceptRefactor() {
    if (!pendingRefactor) return;

    if (pendingRefactor.scope === "local") {
      const { paragraphs, paragraphIndex, diffsByPage } = pendingRefactor;
      const newParagraph = diffsByPage[currentPageId]
        .filter((d) => d.type !== "remove")
        .map((d) => d.text)
        .join(" ");
      const newParagraphs = paragraphs.slice();
      newParagraphs[paragraphIndex] = newParagraph;
      const newRawText = newParagraphs.join("\n\n");

      setPages((prev) =>
        prev.map((p) =>
          p.id === currentPageId ? { ...p, rawText: newRawText } : p,
        ),
      );
    } else {
      const { rewrittenByPage } = pendingRefactor;
      setPages((prev) =>
        prev.map((p) =>
          rewrittenByPage[p.id] ? { ...p, rawText: rewrittenByPage[p.id] } : p,
        ),
      );
    }

    setPendingRefactor(null);
    setRefactorPrompt("");
    setSelection(null);
  }

  function rejectRefactor() {
    setPendingRefactor(null);
  }

  return {
    refactorPrompt,
    setRefactorPrompt,
    pendingRefactor,
    refactorLoading,
    refactorError,
    requestRefactor,
    acceptRefactor,
    rejectRefactor,
    setPendingRefactor,
  };
}
