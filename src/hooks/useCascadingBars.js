import { useCallback, useEffect, useRef } from "react";

const LOW_W = 106;
const LOW_H = 66;
const BAR_W = 3.2;
const PALETTE = [
  "#ffb3d9",
  "#c39bfa",
  "#7f8ef2",
  "#7ff0e0",
  "#6be89a",
  "#d4f57a",
  "#ffd97a",
  "#ff9270",
];

// Drives ONE shared bars simulation across every page thumbnail's canvas,
// on a single virtual canvas the combined height of all of them stacked —
// so a bar growing past the bottom of thumbnail 1 continues seamlessly
// into the top of thumbnail 2, and so on, as if they were windows onto one
// tall continuous canvas rather than independent animations.
export function useCascadingBars(active, pageIds) {
  const canvasEls = useRef(new Map()); // pageId -> <canvas> element

  const registerCanvas = useCallback((pageId, el) => {
    if (el) canvasEls.current.set(pageId, el);
    else canvasEls.current.delete(pageId);
  }, []);

  const pageIdsKey = pageIds.join("|");

  useEffect(() => {
    if (!active || pageIds.length === 0) return;

    const totalH = LOW_H * pageIds.length;
    const shared = document.createElement("canvas");
    shared.width = LOW_W;
    shared.height = totalH;
    const sctx = shared.getContext("2d");
    sctx.imageSmoothingEnabled = false;

    let activeBars = [];
    const completedBars = [];

    function spawnBar() {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const x = Math.random() * (LOW_W - BAR_W);
      activeBars.push({
        x,
        w: BAR_W,
        c: color,
        h: 0,
        v: Math.random() * 0.35 + 0.2,
      });
    }

    const initialCount = Math.floor(LOW_W / BAR_W);
    for (let i = 0; i < initialCount; i++) spawnBar();

    function drawShared() {
      sctx.clearRect(0, 0, LOW_W, totalH);
      for (const b of completedBars) {
        sctx.fillStyle = b.c;
        sctx.fillRect(Math.round(b.x), 0, Math.ceil(b.w), totalH);
      }
      for (const b of activeBars) {
        sctx.fillStyle = b.c;
        sctx.fillRect(Math.round(b.x), 0, Math.ceil(b.w), Math.round(b.h));
      }
    }

    function blitToThumbnails() {
      pageIds.forEach((pageId, idx) => {
        const canvas = canvasEls.current.get(pageId);
        if (!canvas) return;
        if (canvas.width !== LOW_W || canvas.height !== LOW_H) {
          canvas.width = LOW_W;
          canvas.height = LOW_H;
        }
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, LOW_W, LOW_H);
        ctx.drawImage(
          shared,
          0,
          idx * LOW_H,
          LOW_W,
          LOW_H,
          0,
          0,
          LOW_W,
          LOW_H,
        );
      });
    }

    function tick() {
      for (let i = activeBars.length - 1; i >= 0; i--) {
        const b = activeBars[i];
        b.h += b.v;
        if (b.h >= totalH) {
          b.h = totalH;
          completedBars.push({ x: b.x, w: b.w, c: b.c });
          activeBars.splice(i, 1);
          spawnBar();
        }
      }
      drawShared();
      blitToThumbnails();
    }

    const intervalId = setInterval(tick, 40);
    return () => clearInterval(intervalId);
    // pageIds is re-derived every render; pageIdsKey is the stable signal
    // for when the actual set/order of pages changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pageIdsKey]);

  return registerCanvas;
}
