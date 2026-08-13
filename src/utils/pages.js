import { newPageId } from "./ids";

// Roughly a "page" of reading text (~350 words). Used to auto-split long
// text into multiple pages, whether it arrives all at once (upload, sample
// text) or grows past the limit as the user types.
export const DEFAULT_MAX_PAGE_CHARS = 2000;

export function makePage(rawText = "") {
  return { id: newPageId(), rawText };
}

// Splits text into chunks of at most maxChars each, without ever breaking
// inside a word. Prefers to cut at a paragraph break, falling back to a
// sentence end, then a plain word boundary — only cutting mid-word if a
// single run of non-whitespace text is itself longer than maxChars.
export function splitTextIntoChunks(text, maxChars = DEFAULT_MAX_PAGE_CHARS) {
  const normalized = text.trim();
  if (!normalized) return [];

  const chunks = [];
  let rest = normalized;

  while (rest.length > maxChars) {
    const splitAt = findSplitIndex(rest, maxChars);
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// Builds one page per chunk of `text`, split at DEFAULT_MAX_PAGE_CHARS (or
// a custom maxChars) boundaries. Always returns at least one page.
export function makePagesFromText(text, maxChars = DEFAULT_MAX_PAGE_CHARS) {
  const chunks = splitTextIntoChunks(text, maxChars);
  if (chunks.length === 0) return [makePage("")];
  return chunks.map((chunk) => makePage(chunk));
}

function findSplitIndex(text, maxChars) {
  const window = text.slice(0, maxChars);

  const paraBreak = window.lastIndexOf("\n\n");
  if (paraBreak > 0) return paraBreak + 2;

  const sentenceEnd = lastMatchEnd(window, /[.!?]['")\]]?\s/g);
  if (sentenceEnd > 0) return sentenceEnd;

  const wordBreak = lastMatchEnd(window, /\s+/g);
  if (wordBreak > 0) return wordBreak;

  return maxChars; // one unbroken run of text longer than the limit
}

function lastMatchEnd(str, regex) {
  let lastEnd = -1;
  let match;
  while ((match = regex.exec(str)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  return lastEnd;
}
