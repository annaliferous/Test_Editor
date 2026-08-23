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
// sorted, non-overlapping spans, for rendering as plain text interspersed
// with highlighted runs. Any extra fields on a span (e.g. `reason`, or a
// caller-specific tag like `isAnchor`) are carried through onto its segment.
export function buildHighlightSegments(rawText, locatedIssues) {
  if (!locatedIssues || locatedIssues.length === 0) {
    return [{ text: rawText, highlighted: false }];
  }
  const segments = [];
  let cursor = 0;
  for (const span of locatedIssues) {
    const { start, end } = span;
    if (start > cursor) {
      segments.push({ text: rawText.slice(cursor, start), highlighted: false });
    }
    segments.push({ ...span, text: rawText.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < rawText.length) {
    segments.push({ text: rawText.slice(cursor), highlighted: false });
  }
  return segments;
}

// Merges a page's location matches with its anchor (if the anchor happens
// to live on this page) into one sorted span list, then splits the page's
// text around them. Each match segment keeps its original index into the
// page's own matches array (as `matchIndex`) even after the merge-and-sort,
// so a caller can still call accept/dismiss on the right one; the anchor's
// segment is tagged `isAnchor` instead. Shared by the editor and the page
// thumbnails so both render the exact same pin layout for a given page.
export function buildLocationSegments(rawText, pageId, anchor, matches) {
  const anchorOnThisPage = anchor?.pageId === pageId;
  const combinedSpans = [
    ...matches.map((m, i) => ({ ...m, matchIndex: i })),
    ...(anchorOnThisPage ? [{ ...anchor, isAnchor: true }] : []),
  ].sort((a, b) => a.start - b.start);
  return buildHighlightSegments(rawText, combinedSpans).map((seg, idx) => ({
    ...seg,
    key: idx,
  }));
}
