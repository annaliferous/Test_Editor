// App-level overlay: draws a seethrough red line from the location anchor
// to every pin currently on-screen anywhere in the app — in the editor, or
// in a page thumbnail over in the PagesRail — so the rail reads as one
// continuous canvas the line can pass straight through rather than
// stopping at the editor's edge. `pinsBySource` is a map of independent
// reporters (the editor for the current page, one per page thumbnail for
// every other page) each contributing viewport-relative {x, y} points for
// whichever of their pins are actually visible right now; anything
// scrolled out of view simply stops appearing here (its edge-cue ring,
// rendered separately by whichever pane it's off-screen in, covers that
// case instead).
export default function LocationLines({ pendingRewrite, pinsBySource }) {
  if (!pendingRewrite) return null;

  const allPins = Object.assign({}, ...Object.values(pinsBySource));
  const anchorPos = allPins.anchor;
  if (!anchorPos) return null;

  const matchIds = Object.keys(allPins).filter((id) => id !== "anchor");
  if (matchIds.length === 0) return null;

  return (
    <svg className="location-lines" aria-hidden="true">
      {matchIds.map((id) => {
        const pos = allPins[id];
        return (
          <line
            key={id}
            x1={anchorPos.x}
            y1={anchorPos.y}
            x2={pos.x}
            y2={pos.y}
            className="location-line"
          />
        );
      })}
    </svg>
  );
}
