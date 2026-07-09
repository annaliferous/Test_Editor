import { useState } from "react";
import beatingHeart from "./assets/beating_heart.gif";
import "./App.css";

// Every animation available in the sidebar.
// `className` must match a keyframes-based class defined in App.css.
const ANIMATIONS = [
  { key: "fade-in", label: "Fade In" },
  { key: "slide-up", label: "Slide Up" },
  { key: "bounce", label: "Bounce" },
  { key: "shake", label: "Shake" },
  { key: "pulse", label: "Pulse" },
  { key: "rotate-in", label: "Rotate In" },
  { key: "pop", label: "Pop" },
  { key: "love", label: "Love", gif: beatingHeart },
];

let nextId = 0;

function App() {
  const [rawText, setRawText] = useState(
    "Type or paste some text, then split it into words to start animating.",
  );
  // Once split, `words` holds one entry per word:
  // { id, text, animation, run } — `run` is bumped every time an
  // animation is (re)applied so React remounts the div and replays it.
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const isSplit = words.length > 0;

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

  function applyAnimation(animationKey) {
    if (selectedIds.size === 0) return;
    setWords((prev) =>
      prev.map((w) =>
        selectedIds.has(w.id)
          ? { ...w, animation: animationKey, run: w.run + 1 }
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
                      disabled={selectedIds.size === 0}
                      onClick={() => applyAnimation(anim.key)}
                      title={anim.label}
                      aria-label={anim.label}
                    >
                      {anim.gif ? (
                        <img
                          className="btn-animation-gif"
                          src={anim.gif}
                          alt={anim.label}
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
    </div>
  );
}

export default App;
