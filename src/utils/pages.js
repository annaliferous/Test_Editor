import { newPageId } from "./ids";

export function makePage(rawText = "") {
  return { id: newPageId(), rawText, words: [] };
}
