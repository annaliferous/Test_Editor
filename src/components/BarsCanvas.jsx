import { useEffect, useRef } from "react";

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

// Pixel-art "AI thinking" loading animation: colored bars grow down from
// the top, freeze once they reach the bottom, and a new one spawns in
// their place — continuously and randomly. Transparent background, meant
// to overlay on top of the real content rather than replace it. `delay`
// holds the canvas blank until it elapses.
export default function BarsCanvas({ className, delay = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = LOW_W;
    canvas.height = LOW_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    let active = [];
    const completed = [];

    function spawnActive() {
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const x = Math.random() * (LOW_W - BAR_W);
      active.push({ x, w: BAR_W, c: color, h: 0, v: Math.random() * 0.35 + 0.2 });
    }

    function draw() {
      ctx.clearRect(0, 0, LOW_W, LOW_H);
      for (const col of completed) {
        ctx.fillStyle = col.c;
        ctx.fillRect(Math.round(col.x), 0, Math.ceil(col.w), LOW_H);
      }
    }

    function update() {
      draw();
      for (let i = active.length - 1; i >= 0; i--) {
        const a = active[i];
        a.h += a.v;
        const height = Math.min(LOW_H, a.h);
        ctx.fillStyle = a.c;
        ctx.fillRect(Math.round(a.x), 0, Math.ceil(a.w), Math.round(height));
        if (a.h >= LOW_H) {
          completed.push({ x: a.x, w: a.w, c: a.c });
          active.splice(i, 1);
          spawnActive();
        }
      }
    }

    draw(); // blank until the delay elapses and bars start spawning

    const timeoutId = setTimeout(() => {
      const initialCount = Math.floor(LOW_W / BAR_W);
      for (let i = 0; i < initialCount; i++) spawnActive();
    }, delay * 1000);

    const intervalId = setInterval(update, 40);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [delay]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
