import quillIcon from "../assets/quill.png";

// Right sidebar: scope switch (Local/Global) and the consistency-check
// quill tools.
export default function ControlsPane({
  scope,
  onSetScope,
  checkTool,
  checkLoading,
  onToggleCheckArm,
  haloCuesEnabled,
  onToggleHaloCues,
  hasPendingCheck,
}) {
  return (
    <aside className="controls-pane">
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
        <div className="controls-label">Consistency check</div>
        <div className="animation-grid">
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${checkTool === "ai" ? "btn-active" : ""}`}
              disabled={checkLoading}
              onClick={() => onToggleCheckArm("ai")}
              title="Select text to check for inconsistencies"
              aria-label="Toggle consistency-check tool"
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
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${checkTool === "random" ? "btn-active" : ""}`}
              disabled={checkLoading}
              onClick={() => onToggleCheckArm("random")}
              title="Random test check — instant, no AI (for testing the UI)"
              aria-label="Toggle random test-check tool"
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
        {checkTool && (
          <p className="hint">
            Select text in the editor to check it for inconsistencies.
          </p>
        )}
      </div>

      <div className="controls-group">
        <div className="controls-label">Change cues</div>
        <div className="controls-row">
          <button
            className={`btn btn-small btn-halo ${haloCuesEnabled ? "btn-active" : ""}`}
            disabled={!hasPendingCheck}
            onClick={onToggleHaloCues}
            title="Show arc cues pointing toward off-screen flagged issues"
          >
            Off-screen cues
          </button>
        </div>
        {!hasPendingCheck && (
          <p className="hint">Run a consistency check to use this.</p>
        )}
      </div>
    </aside>
  );
}
