import FramePlayer from "./FramePlayer";
import { ANIMATIONS } from "../data/animations";
import { FRAMES } from "../utils/frames";
import { intensityToFrameInterval } from "../utils/animationMath";
import quillIcon from "../assets/quill.png";

// Right sidebar: mode switch (Search/Rewrite), scope switch (Local/Global),
// and the animation buttons with their intensity sliders.
export default function ControlsPane({
  mode,
  onSwitchMode,
  scope,
  onSetScope,
  intensity,
  onSetIntensity,
  isAnimationDisabled,
  onTriggerAnimation,
  onStartGifDrag,
  selectedIds,
  onClearAnimations,
  refactorArmed,
  refactorLoading,
  onToggleRefactorArm,
}) {
  return (
    <aside className="controls-pane">
      <div className="controls-group">
        <div className="controls-label">Selection</div>
        <div className="controls-row">
          <button
            className={`btn btn-small btn-mode-search ${mode === "search" ? "btn-active" : ""}`}
            onClick={() => onSwitchMode("search")}
          >
            Search
          </button>
          <button
            className={`btn btn-small btn-mode-rewrite ${mode === "rewrite" ? "btn-active" : ""}`}
            onClick={() => onSwitchMode("rewrite")}
          >
            Rewrite
          </button>
        </div>
      </div>

      <div className="controls-group">
        <div className="controls-label">Scope</div>
        <div className="controls-row">
          <button
            className={`btn btn-small btn-scope-local ${scope === "local" ? "btn-active" : ""}`}
            onClick={() => onSetScope("local")}
          >
            Local
          </button>
          <button
            className={`btn btn-small btn-scope-global ${scope === "global" ? "btn-active" : ""}`}
            onClick={() => onSetScope("global")}
          >
            Global
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
                onClick={() => {
                  // In Rewrite mode, clicking should not fire the Ollama
                  // rewrite immediately — only dragging the gif and
                  // dropping it into the text does. Search mode still
                  // applies on click, same as always.
                  if (mode === "search") onTriggerAnimation(anim.key);
                }}
                title={anim.label}
                aria-label={anim.label}
                onPointerDown={(e) => {
                  if (anim.gif && !isAnimationDisabled(anim.key))
                    onStartGifDrag(e, anim);
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
                  onSetIntensity((prev) => ({
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

        <div className="controls-group">
          <div className="controls-label">Refactor</div>
          <div className="animation-grid">
            <div className="animation-cell">
              <button
                className={`btn btn-animation btn-refactor ${refactorArmed ? "btn-active" : ""}`}
                disabled={mode !== "rewrite" || refactorLoading}
                onClick={onToggleRefactorArm}
                title="Select text to refactor"
                aria-label="Toggle refactor tool"
                onDragStart={(e) => e.preventDefault()}
              >
                <img
                  src={quillIcon}
                  alt=""
                  className="btn-animation-icon"
                  draggable={false}
                />
              </button>
            </div>
          </div>
          {mode !== "rewrite" ? (
            <p className="hint">Switch to Rewrite to use Refactor.</p>
          ) : (
            refactorArmed && (
              <p className="hint">Select text in the editor to refactor it.</p>
            )
          )}
        </div>
      </div>
    </aside>
  );
}
