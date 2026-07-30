import { useRef, useState, useLayoutEffect } from "react";

// Pointer-based drag-to-reorder for page thumbnails, plus a FLIP animation
// so thumbnails slide smoothly into their new slot after a reorder.
export function usePageDrag(pages, setPages) {
  const pageRefs = useRef(new Map());
  const prevPageRects = useRef(new Map());
  const [draggingPageId, setDraggingPageId] = useState(null);
  const dragMovedRef = useRef(false);

  function registerPageRef(id, el) {
    if (el) pageRefs.current.set(id, el);
    else pageRefs.current.delete(id);
  }

  function findPageDropTargetId(x, y, excludeId) {
    for (const [id, el] of pageRefs.current) {
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

  function reorderPages(draggedId, targetId) {
    pageRefs.current.forEach((el, id) => {
      if (el) prevPageRects.current.set(id, el.getBoundingClientRect());
    });

    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === draggedId);
      const to = prev.findIndex((p) => p.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function startPageDrag(e, page) {
    if (e.target.closest(".page-thumb-delete")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    dragMovedRef.current = false;

    function handleMove(moveEvent) {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!dragMovedRef.current && Math.hypot(dx, dy) > 5) {
        dragMovedRef.current = true;
        setDraggingPageId(page.id);
      }

      if (dragMovedRef.current) {
        const targetId = findPageDropTargetId(
          moveEvent.clientX,
          moveEvent.clientY,
          page.id,
        );
        if (targetId != null) reorderPages(page.id, targetId);
      }
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setDraggingPageId(null);
      // let the trailing click event (if any) know a drag just happened
      setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  // FLIP: animate thumbnails sliding into their new slot after reorder
  useLayoutEffect(() => {
    pageRefs.current.forEach((el, id) => {
      if (!el) return;
      const prev = prevPageRects.current.get(id);
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
    prevPageRects.current.clear();
  }, [pages]);

  return { draggingPageId, dragMovedRef, registerPageRef, startPageDrag };
}
