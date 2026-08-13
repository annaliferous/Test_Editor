// Map-style Halo cue: a ring is centered exactly on the (off-screen)
// target and sized so only a shallow cap of it — `peek` pixels deep —
// dips into the visible clip window. The curvature of that visible cap is
// what a viewer reads: a tight little bulge means the ring is small
// (target close by), a wide shallow bulge means the ring is huge (target
// far away). Scrolling toward the target shrinks its radius in real time,
// so the cap visibly tightens until the target itself comes on screen and
// the cue disappears.
//
// Unlike a generic corner badge, the ring is horizontally centered on the
// target's own actual position (`x`, in pixels relative to the
// positioned ancestor) — it sits right above/below where the flagged
// content actually is, not in a fixed corner. Renders as a real <button>
// so keyboard users get an instant jump with no hover required.
export default function HaloRing({
  direction, // "up" | "down"
  x,
  distance,
  count,
  label,
  onClick,
  minRadius = 12,
  maxRadius = 85,
  peek = 16,
  clipWidth = 100,
}) {
  const pointsUp = direction === "up";
  const radius = Math.min(maxRadius, Math.max(minRadius, distance + peek));
  const diameter = radius * 2;
  const clipHeight = peek + 4;
  // Circle sits mostly outside the clip window; only its near edge (a
  // peek-deep cap) is left visible by the window's overflow:hidden.
  const edgeOffset = peek - diameter;

  return (
    <button
      type="button"
      className={`halo-ring halo-ring-${direction}`}
      style={{
        left: x,
        width: clipWidth,
        marginLeft: -clipWidth / 2,
        [pointsUp ? "top" : "bottom"]: 0,
      }}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className="halo-ring-clip" style={{ height: clipHeight }}>
        <span
          className="halo-ring-circle"
          style={{
            width: diameter,
            height: diameter,
            [pointsUp ? "top" : "bottom"]: edgeOffset,
          }}
        />
      </span>
      {count > 1 && <span className="halo-ring-count">{count}</span>}
    </button>
  );
}
