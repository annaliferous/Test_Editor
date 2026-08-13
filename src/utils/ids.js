// Monotonic id counter shared across the app. Kept as plain module state
// (rather than e.g. crypto.randomUUID) so ids stay small integers and sort
// predictably.
let nextPageId = 0;

export function newPageId() {
  return nextPageId++;
}
