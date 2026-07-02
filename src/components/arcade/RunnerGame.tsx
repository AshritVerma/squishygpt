"use client";

import { useEffect, useRef, useState } from "react";
import { drawCleia, GRID_H, GRID_W, type CleiaFrame } from "@/lib/cleiaSprite";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";
type ObType = "phoropter" | "lens" | "chart";
interface Obstacle {
  x: number;
  w: number;
  h: number;
  type: ObType;
}

const ACCENT = "#ec4899";
const ACCENT2 = "#a855f7";

// Cleia Runner — a Chrome-dino-style endless runner. Tap / Space to hop over
// optometry obstacles. Speed ramps with distance; score is distance traveled.
export function RunnerGame({ best, onGameOver, onExit }: GameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [finalScore, setFinalScore] = useState(0);
  const phaseRef = useRef<Phase>("ready");
  const startRef = useRef<() => void>(() => {});
  const jumpRef = useRef<() => void>(() => {});

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let W = 0;
    let H = 0;
    let dp = 4;
    let dogH = GRID_H * dp;
    let dogW = GRID_W * dp;
    let groundY = 0;
    let cleiaX = 0;
    let jumpV = 900;

    const recalc = () => {
      dp = Math.max(3, Math.round((H * 0.17) / GRID_H));
      dogH = GRID_H * dp;
      dogW = GRID_W * dp;
      groundY = H - Math.max(20, H * 0.12);
      cleiaX = Math.max(16, W * 0.14);
      // jump apex ~1.7 dog-heights
      jumpV = Math.sqrt(2 * gravity * dogH * 1.7);
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      recalc();
    };

    const gravity = 2600;

    // Mutable game state
    let y = 0; // height above ground (up positive)
    let vy = 0;
    let speed = 260;
    let dist = 0;
    let scoreVal = 0;
    let obstacles: Obstacle[] = [];
    let sinceSpawn = 0;
    let nextGap = 0;
    let animT = 0;
    let frameTog = false;
    let squishT = 0;
    let woofT = 0;
    let lastMilestone = 0;
    let bg = 0;

    const reset = () => {
      recalc();
      y = 0;
      vy = 0;
      speed = 260;
      dist = 0;
      scoreVal = 0;
      obstacles = [];
      sinceSpawn = 0;
      nextGap = W * 0.55;
      animT = 0;
      frameTog = false;
      squishT = 0;
      woofT = 0;
      lastMilestone = 0;
    };
    reset();

    const start = () => {
      reset();
      setPhase("playing");
    };
    startRef.current = start;

    const jump = () => {
      if (phaseRef.current !== "playing") return;
      if (y <= 0.5) {
        vy = jumpV;
        navigator.vibrate?.(6);
      }
    };
    jumpRef.current = jump;

    const spawn = () => {
      const t = Math.random();
      let type: ObType;
      let w: number;
      let h: number;
      if (t < 0.4) {
        type = "lens";
        w = dogH * 0.5;
        h = dogH * 0.5;
      } else if (t < 0.75) {
        type = "phoropter";
        w = dogH * 1.05;
        h = dogH * 0.55;
      } else {
        type = "chart";
        w = dogH * 0.55;
        h = dogH * 1.05;
      }
      obstacles.push({ x: W + 12, w, h, type });
    };

    const drawObstacle = (o: Obstacle) => {
      const top = groundY - o.h;
      if (o.type === "lens") {
        const cx = o.x + o.w / 2;
        const cy = groundY - o.h / 2;
        const r = o.w / 2;
        ctx.strokeStyle = ACCENT2;
        ctx.lineWidth = Math.max(2, dp);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(168,85,247,0.18)";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.type === "phoropter") {
        ctx.fillStyle = "#4a3560";
        roundRect(ctx, o.x, top, o.w, o.h, 6);
        ctx.fill();
        const r = o.h * 0.28;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        ctx.arc(o.x + o.w * 0.32, top + o.h * 0.5, r, 0, Math.PI * 2);
        ctx.arc(o.x + o.w * 0.68, top + o.h * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // eye chart
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, o.x, top, o.w, o.h, 4);
        ctx.fill();
        ctx.fillStyle = ACCENT;
        const rows = 4;
        for (let i = 0; i < rows; i++) {
          const lw = o.w * (0.7 - i * 0.13);
          const ly = top + o.h * (0.2 + i * 0.2);
          ctx.fillRect(o.x + (o.w - lw) / 2, ly, lw, Math.max(2, o.h * 0.06));
        }
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (tnow: number) => {
      const dt = Math.min(0.033, (tnow - last) / 1000);
      last = tnow;
      const ph = phaseRef.current;

      if (ph === "playing") {
        speed = 260 + Math.min(320, dist * 0.05);
        dist += speed * dt;
        scoreVal = Math.floor(dist / 12);

        // physics
        const wasAir = y > 0.5;
        vy -= gravity * dt;
        y += vy * dt;
        if (y <= 0) {
          y = 0;
          if (wasAir && vy < 0) squishT = 0.12;
          vy = 0;
        }

        // spawn
        sinceSpawn += speed * dt;
        if (sinceSpawn >= nextGap) {
          spawn();
          sinceSpawn = 0;
          const interval = Math.max(0.72, 1.4 - dist * 0.00006);
          nextGap = speed * interval * (0.85 + Math.random() * 0.5);
        }

        // move + cull
        for (const o of obstacles) o.x -= speed * dt;
        obstacles = obstacles.filter((o) => o.x + o.w > -20);

        // milestone woof
        if (scoreVal >= lastMilestone + 100) {
          lastMilestone = Math.floor(scoreVal / 100) * 100;
          woofT = 1.1;
        }
        if (woofT > 0) woofT -= dt;

        // collision
        const cb = {
          x: cleiaX + dogW * 0.22,
          y: groundY - dogH - y + dogH * 0.12,
          w: dogW * 0.56,
          h: dogH * 0.82,
        };
        for (const o of obstacles) {
          const ob = { x: o.x, y: groundY - o.h, w: o.w, h: o.h };
          if (
            cb.x < ob.x + ob.w &&
            cb.x + cb.w > ob.x &&
            cb.y < ob.y + ob.h &&
            cb.y + cb.h > ob.y
          ) {
            navigator.vibrate?.(30);
            setFinalScore(scoreVal);
            onGameOver(scoreVal);
            setPhase("over");
            break;
          }
        }

        if (squishT > 0) squishT -= dt;
        animT += dt;
        if (animT > 0.1) {
          animT = 0;
          frameTog = !frameTog;
        }
        bg += speed * dt * 0.35;
      }

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);

      // parallax background dots
      if (!reduce) {
        ctx.fillStyle = "rgba(168,85,247,0.10)";
        const gap = 90;
        for (let i = 0; i < Math.ceil(W / gap) + 1; i++) {
          const x = ((i * gap - (bg % gap)) + W) % (W + gap);
          const yy = groundY - dogH * 1.4 - (i % 3) * 22;
          ctx.beginPath();
          ctx.arc(x, yy, 4 + (i % 2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ground
      ctx.strokeStyle = "rgba(236,72,153,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();
      ctx.fillStyle = "rgba(236,72,153,0.35)";
      const tickGap = 26;
      for (let i = 0; i < Math.ceil(W / tickGap) + 1; i++) {
        const x = ((i * tickGap - (bg % tickGap)) + W) % (W + tickGap);
        ctx.fillRect(x, groundY + 4, 10, 2);
      }

      // obstacles
      for (const o of obstacles) drawObstacle(o);

      // Cleia
      let frame: CleiaFrame = "trot1";
      if (ph === "over") frame = "sad";
      else if (y > 4) frame = "trot1";
      else if (squishT > 0) frame = "squish";
      else if (ph === "playing") frame = frameTog ? "trot2" : "trot1";
      const dogTop = groundY - dogH - y;
      drawCleia(ctx, cleiaX, dogTop, dp, { frame });

      // woof popup
      if (woofT > 0 && ph === "playing") {
        ctx.fillStyle = ACCENT;
        ctx.font = `bold ${Math.round(dp * 3)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.globalAlpha = Math.min(1, woofT);
        ctx.fillText("woof!", cleiaX + dogW / 2, dogTop - 6);
        ctx.globalAlpha = 1;
      }

      // score
      ctx.fillStyle = ACCENT;
      ctx.font = "bold 15px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(scoreVal), W - 14, 24);
      ctx.fillStyle = "rgba(124,111,134,0.9)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`best ${Math.max(best, scoreVal)}`, W - 14, 40);

      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    raf = requestAnimationFrame(loop);

    // input
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph === "ready") start();
      else if (ph === "playing") jump();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "ArrowUp") return;
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph === "ready") start();
      else if (ph === "playing") jump();
    };
    wrap.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);

    const onVis = () => {
      if (document.hidden && phaseRef.current === "playing") {
        setFinalScore(scoreVal);
        onGameOver(scoreVal);
        setPhase("over");
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1 overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      {phase === "ready" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <p className="text-base font-bold">Tap to start</p>
          <p className="text-xs text-[var(--muted)]">Tap or Space to hop 🐾</p>
        </div>
      )}

      {phase === "over" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/20 text-center backdrop-blur-[2px]">
          <div className="glass squish-shadow rounded-2xl px-6 py-5">
            <p className="text-sm text-[var(--muted)]">Score</p>
            <p className="text-3xl font-extrabold">
              <span className="accent-text">{finalScore}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Best {Math.max(best, finalScore)}
              {finalScore >= best && finalScore > 0 ? " · new best! 🎉" : ""}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => startRef.current()}
                className="accent-gradient spring rounded-2xl px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
              <button
                onClick={onExit}
                className="spring rounded-2xl px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
