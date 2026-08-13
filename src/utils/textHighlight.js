// Locates each flagged issue's exact position within `rawText` (optionally
// constrained to a sub-range, e.g. a selection), so it can be rendered as a
// highlight. Issues whose text can't be found verbatim are dropped, and
// overlapping matches collapse to the earliest one.
export function locateIssues(rawText, issues, range = null) {
  const searchFrom = range ? range.start : 0;
  const searchTo = range ? range.end : rawText.length;

  const located = [];
  for (const issue of issues) {
    const needle = issue.text?.trim();
    if (!needle) continue;
    const start = rawText.indexOf(needle, searchFrom);
    if (start === -1 || start + needle.length > searchTo) continue;
    located.push({ start, end: start + needle.length, reason: issue.reason });
  }

  located.sort((a, b) => a.start - b.start);
  const merged = [];
  let lastEnd = -1;
  for (const loc of located) {
    if (loc.start < lastEnd) continue;
    merged.push(loc);
    lastEnd = loc.end;
  }
  return merged;
}

// Splits `rawText` into an ordered list of segments using pre-located,
// sorted, non-overlapping issue spans, for rendering as plain text
// interspersed with highlighted runs.
export function buildHighlightSegments(rawText, locatedIssues) {
  if (!locatedIssues || locatedIssues.length === 0) {
    return [{ text: rawText, highlighted: false }];
  }
  const segments = [];
  let cursor = 0;
  for (const { start, end, reason } of locatedIssues) {
    if (start > cursor) {
      segments.push({ text: rawText.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: rawText.slice(start, end), highlighted: true, reason });
    cursor = end;
  }
  if (cursor < rawText.length) {
    segments.push({ text: rawText.slice(cursor), highlighted: false });
  }
  return segments;
}
