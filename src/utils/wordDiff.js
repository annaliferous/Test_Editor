// Splitting free text into words, and diffing two word sequences so a
// rewrite can be shown as inline add/remove spans before it's accepted.

export function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

// Longest-common-subsequence word diff (classic O(n*m) DP), returning a
// flat list of { type: "equal" | "add" | "remove", text } tokens in order.
export function diffWords(oldText, newText) {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i++;
    } else {
      result.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) result.push({ type: "remove", text: a[i++] });
  while (j < m) result.push({ type: "add", text: b[j++] });

  return result;
}
