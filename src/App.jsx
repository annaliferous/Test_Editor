import { useState, useEffect, useRef, useLayoutEffect } from "react";
import beatingHeart from "./assets/beating_heart.gif";
import bouncingBall from "./assets/bouncing_ball.gif";
import emotionList from "./data/emotion-list.json";
import "./App.css";

// Every animation available in the sidebar.
// `className` must match a keyframes-based class defined in App.css.
const ANIMATIONS = [
  // { key: "fade-in", label: "Fade In" },
  // { key: "slide-up", label: "Slide Up" },
  { key: "joy", label: "Joy", gif: bouncingBall },
  // { key: "shake", label: "Shake" },
  // { key: "pulse", label: "Pulse" },
  // { key: "rotate-in", label: "Rotate In" },
  // { key: "pop", label: "Pop" },
  { key: "love", label: "Love", gif: beatingHeart },
];

// mapping keys to words
const EMOTION_WORD_LISTS = emotionList.reduce((acc, entry) => {
  acc[entry.emotion] = entry.word_list;
  return acc;
}, {});
console.log("EMOTION_WORD_LISTS:", EMOTION_WORD_LISTS);

let nextId = 0;

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function diffWords(oldText, newText) {
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

function App() {
  const [rawText, setRawText] = useState(
    "I felt a deep affection and passion for this project. Also the bliss and happiness made me feel joy",
  );
  // Once split, `words` holds one entry per word:
  // { id, text, animation, run } — `run` is bumped every time an
  // animation is (re)applied so React remounts the div and replays it.
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const isSplit = words.length > 0;

  const [mode, setMode] = useState("search"); // "search" | "rewrite"
  const [pendingRewrite, setPendingRewrite] = useState(null); // { emotion, diff }
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState(null);

  // move words around in the canvas
  const wordRefs = useRef(new Map());
  const [draggingWordId, setDraggingWordId] = useState(null);
  const prevRects = useRef(new Map()); // for FLIP

  function startWordDrag(e, word) {
    e.preventDefault();
    setDraggingWordId(word.id);

    function handleMove(moveEvent) {
      const targetId = findDropTargetId(
        moveEvent.clientX,
        moveEvent.clientY,
        word.id,
      );
      if (targetId != null) {
        reorderWords(word.id, targetId);
      }
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setDraggingWordId(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function findDropTargetId(x, y, excludeId) {
    for (const [id, el] of wordRefs.current) {
      if (id === excludeId || !el) continue;
      const rect = el.getBoundingClientRect();
      if (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      ) {
        return id;
      }
    }
    return null;
  }
  function reorderWords(draggedId, targetId) {
    // snapshot current positions before reflow
    wordRefs.current.forEach((el, id) => {
      if (el) prevRects.current.set(id, el.getBoundingClientRect());
    });

    setWords((prev) => {
      const from = prev.findIndex((w) => w.id === draggedId);
      const to = prev.findIndex((w) => w.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  useLayoutEffect(() => {
    wordRefs.current.forEach((el, id) => {
      if (!el) return;
      const prev = prevRects.current.get(id);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx || dy) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 0.25s ease";
          el.style.transform = "";
        });
      }
    });
  }, [words]);

  // Handle dragging of animation buttons
  const [dragState, setDragState] = useState(null);

  // used animation
  const [loadingAnim, setLoadingAnim] = useState(null);

  // intensity of emotions
  const [intensity, setIntensity] = useState({ joy: 50, love: 50 }); // 0–100
  // higher intensity = faster (shorter) animation duration
  function intensityToDuration(value, minSec, maxSec) {
    const t = value / 100;
    return (maxSec - t * (maxSec - minSec)).toFixed(2);
  }

  // FramePlayer to animation single frames
  function FramePlayer({ frames, intervalMs, className, alt }) {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
      if (!frames || frames.length === 0) return;
      const id = setInterval(() => {
        setFrameIndex((i) => (i + 1) % frames.length);
      }, intervalMs);
      return () => clearInterval(id);
    }, [frames, intervalMs]);

    if (!frames || frames.length === 0) return null;
    return (
      <img
        src={frames[frameIndex]}
        alt={alt}
        className={className}
        draggable={false}
      />
    );
  }

  const loveFramesRaw = import.meta.glob("./assets/love/*.png", {
    eager: true,
    import: "default",
  });
  const joyFramesRaw = import.meta.glob("./assets/joy/*.png", {
    eager: true,
    import: "default",
  });

  function sortedFrames(rawGlob) {
    return Object.keys(rawGlob)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      )
      .map((k) => rawGlob[k]);
  }

  const FRAMES = {
    love: sortedFrames(loveFramesRaw),
    joy: sortedFrames(joyFramesRaw),
  };

  function intensityToFrameInterval(value, minMs, maxMs) {
    const t = value / 100;
    return Math.round(maxMs - t * (maxMs - minMs));
  }

  function intensityToDescriptor(value) {
    if (value < 20) return "very subtly, barely noticeable";
    if (value < 40) return "mildly";
    if (value < 60) return "moderately";
    if (value < 80) return "strongly";
    return "extremely intensely, unmistakably";
  }

  function startGifDrag(e, anim) {
    e.preventDefault(); // stop native drag/text-selection from kicking in
    setDragState({
      key: anim.key,
      gif: anim.gif,
      label: anim.label,
      x: e.clientX,
      y: e.clientY,
    });

    function handleMove(moveEvent) {
      setDragState((prev) =>
        prev ? { ...prev, x: moveEvent.clientX, y: moveEvent.clientY } : prev,
      );
    }

    function handleUp(upEvent) {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);

      // Find whatever element is under the cursor when released, and
      // check if it (or an ancestor) is the word canvas.
      const dropEl = document.elementFromPoint(
        upEvent.clientX,
        upEvent.clientY,
      );
      if (dropEl && dropEl.closest(".word-canvas")) {
        triggerAnimationAction(anim.key);
      }

      setDragState(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handleSplit() {
    const parts = rawText.trim().split(/\s+/).filter(Boolean);
    setWords(
      parts.map((text) => ({
        id: nextId++,
        text,
        animation: null,
        run: 0,
      })),
    );
    setSelectedIds(new Set());
  }

  function handleBackToEdit() {
    setWords([]);
    setSelectedIds(new Set());
  }

  function toggleWord(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Finds word ids whose text contains (substring, case-insensitive,
  // punctuation-stripped) any word from the given animation's word list.
  function getEmotionMatchIds(animationKey) {
    const list = EMOTION_WORD_LISTS[animationKey];
    if (!list || list.length === 0) return new Set();

    const lowerList = list.map((w) => w.toLowerCase());
    const matches = new Set();

    words.forEach((w) => {
      const clean = w.text.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (lowerList.some((listWord) => clean.includes(listWord))) {
        matches.add(w.id);
      }
    });

    return matches;
  }

  function applyAnimation(animationKey) {
    const matchedIds = getEmotionMatchIds(animationKey);
    const targetIds = new Set([...selectedIds, ...matchedIds]);
    if (targetIds.size === 0) return;

    // If every targeted word already has this animation active,
    // treat this click as "turn it off" instead of re-applying it.
    const targetWords = words.filter((w) => targetIds.has(w.id));
    const allAlreadyActive = targetWords.every(
      (w) => w.animation === animationKey,
    );

    setWords((prev) =>
      prev.map((w) =>
        targetIds.has(w.id)
          ? {
              ...w,
              animation: allAlreadyActive ? null : animationKey,
              run: w.run + 1,
            }
          : w,
      ),
    );
  }

  function clearAnimations() {
    setWords((prev) =>
      prev.map((w) =>
        selectedIds.has(w.id) ? { ...w, animation: null, run: w.run + 1 } : w,
      ),
    );
  }

  // Ollama
  async function requestRewrite(animationKey) {
    const anim = ANIMATIONS.find((a) => a.key === animationKey);
    const emotionLabel = anim?.label || animationKey;
    const level = intensity[animationKey] ?? 50;
    const descriptor = intensityToDescriptor(level);
    const originalText = words.map((w) => w.text).join(" ");

    setRewriteLoading(true);
    setLoadingAnim(anim);
    setRewriteError(null);
    setPendingRewrite(null);

    try {
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
      setPendingRewrite({ emotion: animationKey, diff });
    } catch (err) {
      setRewriteError(
        err.message.includes("fetch")
          ? "Couldn't reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?"
          : err.message,
      );
    } finally {
      setRewriteLoading(false);
      setLoadingAnim(null);
    }
  }

  function acceptRewrite() {
    if (!pendingRewrite) return;
    const newWords = pendingRewrite.diff
      .filter((d) => d.type !== "remove")
      .map((d) => ({ id: nextId++, text: d.text, animation: null, run: 0 }));
    setWords(newWords);
    setSelectedIds(new Set());
    setPendingRewrite(null);
  }

  function rejectRewrite() {
    setPendingRewrite(null);
  }

  function triggerAnimationAction(animationKey) {
    if (mode === "rewrite") {
      requestRewrite(animationKey);
    } else {
      applyAnimation(animationKey);
    }
  }

  function isAnimationDisabled(animationKey) {
    if (rewriteLoading) return true;
    if (mode === "rewrite") {
      return words.length === 0 || !EMOTION_WORD_LISTS[animationKey];
    }
    if (selectedIds.size > 0) return false;
    return !EMOTION_WORD_LISTS[animationKey];
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Word Animator</h1>
        <p>
          Write text, split it into words, select words, apply an animation.
        </p>
      </header>

      <main className="layout">
        <section className="editor-pane">
          {/* Animation overlay during rewrite */}
          {rewriteLoading && loadingAnim && (
            <div className="loading-overlay" aria-hidden="true">
              {Array.from({ length: 7 }).map((_, i) => (
                <img
                  key={i}
                  src={loadingAnim.gif}
                  alt=""
                  className="loading-gif"
                  style={{
                    left: `${(i * 37) % 100}%`,
                    top: `${(i * 53) % 100}%`,
                    width: `${28 + (i % 3) * 14}px`,
                    animationDelay: `${(i * 0.18).toFixed(2)}s`,
                    animationDuration: `${1.1 + (i % 3) * 0.25}s`,
                  }}
                />
              ))}
            </div>
          )}
          {/* Ollama rewrite */}
          {pendingRewrite ? (
            <div className="rewrite-panel">
              <div className="rewrite-diff">
                {pendingRewrite.diff.map((d, idx) => (
                  <span key={idx} className={`diff-word diff-${d.type}`}>
                    {d.text}{" "}
                  </span>
                ))}
              </div>
              <div className="rewrite-actions">
                <button
                  className="btn btn-small btn-primary"
                  onClick={acceptRewrite}
                >
                  Accept
                </button>
                <button
                  className="btn btn-small btn-ghost"
                  onClick={rejectRewrite}
                >
                  Reject
                </button>
              </div>
            </div>
          ) : !isSplit ? (
            <textarea
              className="editor-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Start typing..."
            />
          ) : (
            <div
              className="word-canvas"
              style={{
                "--joy-duration": `${intensityToDuration(intensity.joy, 0.35, 1.1)}s`,
                "--love-duration": `${intensityToDuration(intensity.love, 0.5, 2)}s`,
              }}
            >
              {words.map((word) => (
                <div
                  key={`${word.id}-${word.run}`}
                  ref={(el) => {
                    if (el) wordRefs.current.set(word.id, el);
                    else wordRefs.current.delete(word.id);
                  }}
                  className={[
                    "word",
                    word.animation ? `anim-${word.animation}` : "",
                    selectedIds.has(word.id) ? "word-selected" : "",
                    draggingWordId === word.id ? "word-dragging" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggleWord(word.id)}
                  onPointerDown={(e) => startWordDrag(e, word)}
                >
                  {word.text}
                </div>
              ))}
            </div>
          )}
          {rewriteLoading && (
            <p className="hint">Asking Ollama for a rewrite…</p>
          )}
          {rewriteError && <p className="hint hint-error">{rewriteError}</p>}
        </section>

        <aside className="controls-pane">
          <div className="controls-group">
            {!isSplit ? (
              <button className="btn btn-primary" onClick={handleSplit}>
                Split into words
              </button>
            ) : (
              <button className="btn" onClick={handleBackToEdit}>
                ← Back to edit
              </button>
            )}
          </div>

          {isSplit && (
            <>
              <div className="controls-group">
                <div className="controls-label">Selection</div>
                <div className="controls-row">
                  <button
                    className={`btn btn-small ${mode === "search" ? "btn-active" : ""}`}
                    onClick={() => setMode("search")}
                  >
                    Search
                  </button>
                  <button
                    className={`btn btn-small ${mode === "rewrite" ? "btn-active" : ""}`}
                    onClick={() => setMode("rewrite")}
                  >
                    Rewrite
                  </button>
                </div>
              </div>

              <div className="controls-group">
                <div className="controls-label">Animations</div>
                <div className="animation-grid">
                  {ANIMATIONS.map((anim) => (
                    <div key={anim.key} className="animation-cell">
                      <button
                        className="btn btn-animation"
                        disabled={isAnimationDisabled(anim.key)}
                        onClick={() => triggerAnimationAction(anim.key)}
                        title={anim.label}
                        aria-label={anim.label}
                        onPointerDown={(e) => {
                          if (anim.gif && !isAnimationDisabled(anim.key)) {
                            startGifDrag(e, anim);
                          }
                        }}
                        onDragStart={(e) => e.preventDefault()}
                      >
                        {anim.gif ? (
                          <FramePlayer
                            frames={FRAMES[anim.key]}
                            intervalMs={intensityToFrameInterval(
                              intensity[anim.key] ?? 50,
                              40,
                              220,
                            )}
                            className="btn-animation-gif"
                            alt={anim.label}
                          />
                        ) : (
                          anim.label
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={intensity[anim.key] ?? 50}
                        onChange={(e) =>
                          setIntensity((prev) => ({
                            ...prev,
                            [anim.key]: Number(e.target.value),
                          }))
                        }
                        className="intensity-slider"
                        aria-label={`${anim.label} intensity`}
                      />
                    </div>
                  ))}
                </div>
                {mode === "search" && (
                  <button
                    className="btn btn-small btn-ghost"
                    disabled={selectedIds.size === 0}
                    onClick={clearAnimations}
                  >
                    Remove animation
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
      {dragState && (
        <img
          src={dragState.gif}
          alt={dragState.label}
          style={{
            position: "fixed",
            left: dragState.x,
            top: dragState.y,
            width: 48,
            height: 48,
            objectFit: "cover",
            borderRadius: 4,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none", // critical: lets elementFromPoint "see through" it
            zIndex: 1000,
          }}
        />
      )}
    </div>
  );
}

export default App;
