import { useState } from "react";
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

  // Handle dragging of animation buttons
  const [dragState, setDragState] = useState(null);

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
        applyAnimation(anim.key);
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

  function selectAll() {
    setSelectedIds(new Set(words.map((w) => w.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
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

  // A button should be usable if there's a manual selection, or if this
  // animation has a word list that could auto-match something.
  function isAnimationDisabled(animationKey) {
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
          {!isSplit ? (
            <textarea
              className="editor-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Start typing..."
            />
          ) : (
            <div className="word-canvas">
              {words.map((word) => (
                <div
                  key={`${word.id}-${word.run}`}
                  className={[
                    "word",
                    word.animation ? `anim-${word.animation}` : "",
                    selectedIds.has(word.id) ? "word-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggleWord(word.id)}
                >
                  {word.text}
                </div>
              ))}
            </div>
          )}
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
                  <button className="btn btn-small" onClick={selectAll}>
                    Select all
                  </button>
                  <button className="btn btn-small" onClick={clearSelection}>
                    Clear
                  </button>
                </div>
                <p className="hint">
                  {selectedIds.size} word{selectedIds.size === 1 ? "" : "s"}{" "}
                  selected
                </p>
              </div>

              <div className="controls-group">
                <div className="controls-label">Animations</div>
                <div className="animation-grid">
                  {ANIMATIONS.map((anim) => (
                    <button
                      key={anim.key}
                      className="btn btn-animation"
                      disabled={isAnimationDisabled(anim.key)}
                      onClick={() => applyAnimation(anim.key)}
                      title={anim.label}
                      aria-label={anim.label}
                      onPointerDown={(e) => {
                        if (anim.gif && !isAnimationDisabled(anim.key)) {
                          startGifDrag(e, anim);
                        }
                      }}
                    >
                      {anim.gif ? (
                        <img
                          className="btn-animation-gif"
                          src={anim.gif}
                          alt={anim.label}
                          draggable={false}
                        />
                      ) : (
                        anim.label
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-small btn-ghost"
                  disabled={selectedIds.size === 0}
                  onClick={clearAnimations}
                >
                  Remove animation
                </button>
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
