"use client";

import { useEffect, useRef, useState } from "react";
import { drawCleia, GRID_H, GRID_W, type CleiaFrame } from "@/lib/cleiaSprite";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";
interface Tower {
  x: number;
  w: number;
  gapY: number; // center of the gap
  gapH: number;
  passed: boolean;
}

const ACCENT = "#ec4899";
const ACCENT2 = "#a855f7";

// Cleia Flappy — tap / Space to flap between gaps in phoropter towers.
// Score is towers cleared; gaps tighten and speed ramps as you go.
export function FlappyGame({ best, onGameOver, onExit }: GameProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [finalScore, setFinalScore] = useState(0);
  const phaseRef = useRef<Phase>("ready");
  const startRef = useRef<() => void>(() => {});

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
    let dp = 3;
    let dogH = GRID_H * dp;
    let dogW = GRID_W * dp;
    let groundY = 0;
    let dogX = 0;
    let flapV = 480;

    const gravity = 1900;

    const recalc = () => {
      dp = Math.max(2, Math.round((H * 0.11) / GRID_H));
      dogH = GRID_H * dp;
      dogW = GRID_W * dp;
      groundY = H - Math.max(14, H * 0.06);
      dogX = Math.max(14, W * 0.18);
      // each flap lifts her about 1.1 dog-heights
      flapV = Math.sqrt(2 * gravity * dogH * 1.1);
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

    // Mutable game state
    let dogY = 0; // top of sprite, px from canvas top
    let vy = 0;
    let scoreVal = 0;
    let towers: Tower[] = [];
    let sinceSpawn = 0;
    let nextGap = 0;
    let animT = 0;
    let frameTog = false;
    let idleT = 0;
    let bg = 0;

    const reset = () => {
      recalc();
      dogY = (H - dogH) * 0.42;
      vy = 0;
      scoreVal = 0;
      towers = [];
      sinceSpawn = nextGap; // first tower spawns promptly
      nextGap = Math.max(230, W * 0.6);
      animT = 0;
      frameTog = false;
    };
    reset();

    const start = () => {
      reset();
      setPhase("playing");
      flap();
    };
    startRef.current = start;

    const flap = () => {
      if (phaseRef.current !== "playing") return;
      vy = -flapV;
      navigator.vibrate?.(6);
    };

    const spawn = () => {
      const gapH = dogH * Math.max(2.2, 2.75 - scoreVal * 0.022);
      const margin = gapH / 2 + dogH * 0.4;
      const gapY = margin + Math.random() * (groundY - 2 * margin);
      towers.push({ x: W + 12, w: dogW * 0.85, gapY, gapH, passed: false });
    };

    const drawTower = (t: Tower) => {
      const gapTop = t.gapY - t.gapH / 2;
      const gapBot = t.gapY + t.gapH / 2;
      const segments: [number, number][] = [
        [0, gapTop],
        [gapBot, groundY],
      ];
      for (const [y0, y1] of segments) {
        const h = y1 - y0;
        if (h <= 0) continue;
        ctx.fillStyle = "#4a3560";
        roundRect(ctx, t.x, y0, t.w, h, 6);
        ctx.fill();
        // a column of pink lenses, like a stacked phoropter
        const r = t.w * 0.26;
        const step = dogH * 0.62;
        ctx.fillStyle = ACCENT;
        for (let ly = y0 + step / 2; ly < y1 - r * 0.6; ly += step) {
          ctx.beginPath();
          ctx.arc(t.x + t.w / 2, ly, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // lip at the gap edge
        ctx.fillStyle = ACCENT2;
        const lipH = Math.max(4, dogH * 0.12);
        const lipY = y0 === 0 ? y1 - lipH : y0;
        roundRect(ctx, t.x - 3, lipY, t.w + 6, lipH, 3);
        ctx.fill();
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (tnow: number) => {
      const dt = Math.min(0.033, (tnow - last) / 1000);
      last = tnow;
      const ph = phaseRef.current;

      if (ph === "playing") {
        const speed = 170 + Math.min(140, scoreVal * 4);

        // physics
        vy += gravity * dt;
        dogY += vy * dt;
        if (dogY < 0) {
          dogY = 0;
          vy = 0;
        }

        // spawn
        sinceSpawn += speed * dt;
        if (sinceSpawn >= nextGap) {
          spawn();
          sinceSpawn = 0;
          nextGap = Math.max(230, W * 0.6);
        }

        // move + cull + score
        for (const t of towers) {
          t.x -= speed * dt;
          if (!t.passed && t.x + t.w < dogX) {
            t.passed = true;
            scoreVal += 1;
            navigator.vibrate?.(4);
          }
        }
        towers = towers.filter((t) => t.x + t.w > -20);

        // collision: ground, or a tower outside its gap
        const cb = {
          x: dogX + dogW * 0.22,
          y: dogY + dogH * 0.15,
          w: dogW * 0.56,
          h: dogH * 0.7,
        };
        let dead = cb.y + cb.h >= groundY;
        if (!dead) {
          for (const t of towers) {
            if (cb.x + cb.w <= t.x || cb.x >= t.x + t.w) continue;
            const gapTop = t.gapY - t.gapH / 2;
            const gapBot = t.gapY + t.gapH / 2;
            if (cb.y < gapTop || cb.y + cb.h > gapBot) {
              dead = true;
              break;
            }
          }
        }
        if (dead) {
          navigator.vibrate?.(30);
          setFinalScore(scoreVal);
          onGameOver(scoreVal);
          setPhase("over");
        }

        animT += dt;
        if (animT > 0.09) {
          animT = 0;
          frameTog = !frameTog;
        }
        bg += speed * dt * 0.35;
      } else if (ph === "ready") {
        // gentle hover on the start screen
        idleT += dt;
        dogY = (H - dogH) * 0.42 + Math.sin(idleT * 2.2) * dogH * 0.12;
      }

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);

      // parallax background dots
      if (!reduce) {
        ctx.fillStyle = "rgba(168,85,247,0.10)";
        const gap = 90;
        for (let i = 0; i < Math.ceil(W / gap) + 1; i++) {
          const x = ((i * gap - (bg % gap)) + W) % (W + gap);
          const yy = H * 0.2 + ((i % 4) * H * 0.18);
          ctx.beginPath();
          ctx.arc(x, yy, 4 + (i % 2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const t of towers) drawTower(t);

      // ground
      ctx.strokeStyle = "rgba(236,72,153,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();

      // Cleia, tilted with her vertical speed
      let frame: CleiaFrame = "idle";
      if (ph === "over") frame = "sad";
      else if (ph === "playing") frame = frameTog ? "trot2" : "trot1";
      const angle =
        ph === "playing" ? Math.max(-0.3, Math.min(0.45, vy / 900)) : 0;
      ctx.save();
      ctx.translate(dogX + dogW / 2, dogY + dogH / 2);
      ctx.rotate(angle);
      drawCleia(ctx, -dogW / 2, -dogH / 2, dp, { frame });
      ctx.restore();

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
      else if (ph === "playing") flap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "ArrowUp") return;
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph === "ready") start();
      else if (ph === "playing") flap();
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
          <p className="text-xs text-[var(--muted)]">
            Tap or Space to flap through the gaps 🐾
          </p>
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
