// Right sidebar: scope switch (Local/Global) and the three Location tools
// — pin (off-screen cues + connecting line), trail (size shrinks with
// document distance from the anchor), and time (a stopwatch that fills up
// with document distance from the anchor).
export default function ControlsPane({
  scope,
  onSetScope,
  armedTool,
  rewriteLoading,
  onToggleArm,
  haloCuesEnabled,
  onToggleHaloCues,
  hasPendingPins,
  trailDistanceMode,
  onSetTrailDistanceMode,
  timeDistanceMode,
  onSetTimeDistanceMode,
}) {
  return (
    <aside className="controls-pane">
      <div className="controls-group">
        <div className="controls-label">Scope</div>
        <div className="controls-row">
          <button
            className={`btn btn-small btn-scope-local ${scope === "local" ? "btn-active" : ""}`}
            onClick={() => onSetScope("local")}
            aria-pressed={scope === "local"}
          >
            Local
          </button>
          <button
            className={`btn btn-small btn-scope-global ${scope === "global" ? "btn-active" : ""}`}
            onClick={() => onSetScope("global")}
            aria-pressed={scope === "global"}
          >
            Global
          </button>
        </div>
      </div>

      <div className="controls-group">
        <div className="controls-label">Location</div>
        <div className="animation-grid">
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "pin-ai" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("pin-ai")}
              title="Select a location's name to drop a pin and find other mentions of it"
              aria-label="Toggle location-pin tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                📌
              </span>
            </button>
          </div>
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "pin-random" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("pin-random")}
              title="Random test pins — instant, no AI (for testing the UI)"
              aria-label="Toggle random test location-pin tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                📌
              </span>
            </button>
          </div>
        </div>
        {(armedTool === "pin-ai" || armedTool === "pin-random") && (
          <p className="hint">
            Select a location's name in the editor, then drop a pin to find
            other mentions of it.
          </p>
        )}
      </div>

      <div className="controls-group">
        <div className="controls-label">Trail</div>
        <div className="animation-grid">
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "trail-ai" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("trail-ai")}
              title="Select a location's name to mark it and find other mentions, sized by distance"
              aria-label="Toggle location-trail tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                📍
              </span>
            </button>
          </div>
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "trail-random" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("trail-random")}
              title="Random test trail — instant, no AI (for testing the UI)"
              aria-label="Toggle random test location-trail tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                📍
              </span>
            </button>
          </div>
        </div>
        {(armedTool === "trail-ai" || armedTool === "trail-random") && (
          <p className="hint">
            Select a location's name in the editor, then drop a marker — its
            size, and every match found, shrinks with distance through the
            document.
          </p>
        )}
        <div className="controls-row controls-row-tight">
          <button
            className={`btn btn-small btn-mode-toggle ${trailDistanceMode === "both" ? "btn-active" : ""}`}
            onClick={() => onSetTrailDistanceMode("both")}
            title="Markers shrink the farther they are from the pin, in either direction through the document"
            aria-pressed={trailDistanceMode === "both"}
          >
            Both directions
          </button>
          <button
            className={`btn btn-small btn-mode-toggle ${trailDistanceMode === "forward" ? "btn-active" : ""}`}
            onClick={() => onSetTrailDistanceMode("forward")}
            title="Markers shrink only for mentions later in the document than the pin; earlier ones stay full size"
            aria-pressed={trailDistanceMode === "forward"}
          >
            Forward only
          </button>
        </div>
      </div>

      <div className="controls-group">
        <div className="controls-label">Time</div>
        <div className="animation-grid">
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "time-ai" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("time-ai")}
              title="Select a time reference to mark it and find other mentions that might conflict with it"
              aria-label="Toggle time-inconsistency tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                ⏱️
              </span>
            </button>
          </div>
          <div className="animation-cell">
            <button
              className={`btn btn-animation btn-refactor ${armedTool === "time-random" ? "btn-active" : ""}`}
              disabled={rewriteLoading}
              onClick={() => onToggleArm("time-random")}
              title="Random test stopwatches — instant, no AI (for testing the UI)"
              aria-label="Toggle random test time-inconsistency tool"
              onDragStart={(e) => e.preventDefault()}
            >
              <span className="btn-animation-icon" aria-hidden="true">
                ⏱️
              </span>
            </button>
          </div>
        </div>
        {(armedTool === "time-ai" || armedTool === "time-random") && (
          <p className="hint">
            Select a time reference in the editor, then drop a stopwatch —
            every match found fills up more the farther it sits from the
            pin, through the document.
          </p>
        )}
        <div className="controls-row controls-row-tight">
          <button
            className={`btn btn-small btn-mode-toggle ${timeDistanceMode === "both" ? "btn-active" : ""}`}
            onClick={() => onSetTimeDistanceMode("both")}
            title="Stopwatches fill the farther they are from the pin, in either direction through the document"
            aria-pressed={timeDistanceMode === "both"}
          >
            Both directions
          </button>
          <button
            className={`btn btn-small btn-mode-toggle ${timeDistanceMode === "forward" ? "btn-active" : ""}`}
            onClick={() => onSetTimeDistanceMode("forward")}
            title="Stopwatches fill only for mentions later in the document than the pin; earlier ones stay empty"
            aria-pressed={timeDistanceMode === "forward"}
          >
            Forward only
          </button>
        </div>
      </div>

      <div className="controls-group">
        <div className="controls-label">Change cues</div>
        <div className="controls-row">
          <button
            className={`btn btn-small btn-halo ${haloCuesEnabled ? "btn-active" : ""}`}
            disabled={!hasPendingPins}
            onClick={onToggleHaloCues}
            title="Show ring cues pointing toward off-screen location pins"
            aria-pressed={haloCuesEnabled}
          >
            Off-screen cues
          </button>
        </div>
        {!hasPendingPins && (
          <p className="hint">Drop a location pin to use this.</p>
        )}
      </div>
    </aside>
  );
}
