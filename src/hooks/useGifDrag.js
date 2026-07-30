import { useState } from "react";

// Tracks the ghost image while an animation button is being dragged, and
// calls `onDrop(animationKey)` when it's released over the word canvas.
export function useGifDrag(onDrop) {
  const [dragState, setDragState] = useState(null);

  function startGifDrag(e, anim) {
    e.preventDefault();
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
      const dropEl = document.elementFromPoint(
        upEvent.clientX,
        upEvent.clientY,
      );
      if (dropEl && dropEl.closest(".word-canvas")) {
        onDrop(anim.key);
      }
      setDragState(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return { dragState, startGifDrag };
}
