// Ghost image that follows the pointer while an animation button is being
// dragged onto the word canvas.
export default function DragGhost({ dragState }) {
  if (!dragState) return null;
  return (
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
        pointerEvents: "none",
        zIndex: 1000,
      }}
    />
  );
}
