// Monotonic id counters shared across the app. Kept as plain module state
// (rather than e.g. crypto.randomUUID) so ids stay small integers and sort
// predictably, which the diff/rewrite logic relies on.
let nextWordId = 0;
let nextPageId = 0;

export function newWordId() {
  return nextWordId++;
}

export function newPageId() {
  return nextPageId++;
}
