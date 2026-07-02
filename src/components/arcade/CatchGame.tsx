"use client";

import { useEffect, useRef, useState } from "react";
import { drawCleia, GRID_H, GRID_W, type CleiaFrame } from "@/lib/cleiaSprite";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";
type ItemType = "bone" | "heart" | "charm" | "grape";
interface Item {
  x: number;
  y: number;
  vy: number;
  drift: number;
  r: number;
  type: ItemType;
}
interface Pop {
  x: number;
  y: number;
  t: number;
  glyph: string;
}

const ACCENT = "#ec4899";
const ACCENT2 = "#a855f7";
const POINTS: Record<ItemType, number> = { bone: 1, heart: 2, charm: 5, grape: 0 };

// Treat Catch — slide Cleia along the bottom to catch falling bones, hearts,
// and her gold "C" charm; dodge grapes (toxic to dogs). Three lives.
export function CatchGame({ best, onGameOver, onExit }: GameProps) {
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

    let W = 0;
    let H = 0;
    let dp = 4;
    let dogH = GRID_H * dp;
    let dogW = GRID_W * dp;
    let dogTop = 0;
    let cleiaX = 0;
    let targetX = 0;

    const recalc = () => {
      dp = Math.max(3, Math.round((H * 0.16) / GRID_H));
      dogH = GRID_H * dp;
      dogW = GRID_W * dp;
      dogTop = H - dogH - Math.max(8, H * 0.03);
      cleiaX = Math.min(Math.max(cleiaX, 0), Math.max(0, W - dogW));
      targetX = cleiaX;
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

    // game state
    let items: Item[] = [];
    let pops: Pop[] = [];
    let scoreVal = 0;
    let lives = 3;
    let elapsed = 0;
    let sinceSpawn = 0;
    let nextGap = 0.9;
    let animT = 0;
    let frameTog = false;
    let sadT = 0;
    let flashT = 0;
    let moving = false;

    const reset = () => {
      recalc();
      cleiaX = (W - dogW) / 2;
      targetX = cleiaX;
      items = [];
      pops = [];
      scoreVal = 0;
      lives = 3;
      elapsed = 0;
      sinceSpawn = 0;
      nextGap = 0.9;
      sadT = 0;
      flashT = 0;
    };
    reset();

    const start = () => {
      reset();
      setPhase("playing");
    };
    startRef.current = start;

    const spawn = () => {
      const t = Math.random();
      let type: ItemType;
      if (t < 0.25) type = "grape";
      else if (t < 0.62) type = "bone";
      else if (t < 0.9) type = "heart";
      else type = "charm";
      const r = dp * 3.2;
      const fall = 150 + Math.min(230, elapsed * 14);
      items.push({
        x: r + Math.random() * (W - 2 * r),
        y: -r,
        vy: fall * (0.9 + Math.random() * 0.3),
        drift: (Math.random() * 2 - 1) * 40,
        r,
        type,
      });
    };

    const drawItem = (it: Item) => {
      const { x, y, r, type } = it;
      if (type === "bone") {
        ctx.fillStyle = "#f4ddbf";
        const k = r * 0.5;
        ctx.beginPath();
        ctx.arc(x - r * 0.7, y - k, k, 0, Math.PI * 2);
        ctx.arc(x - r * 0.7, y + k, k, 0, Math.PI * 2);
        ctx.arc(x + r * 0.7, y - k, k, 0, Math.PI * 2);
        ctx.arc(x + r * 0.7, y + k, k, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - r * 0.7, y - k, r * 1.4, k * 2);
      } else if (type === "heart") {
        ctx.fillStyle = ACCENT;
        heart(ctx, x, y, r * 1.1);
      } else if (type === "charm") {
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#241a1a";
        ctx.font = `bold ${Math.round(r * 1.5)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("C", x, y + 1);
        ctx.textBaseline = "alphabetic";
      } else {
        // grape cluster
        ctx.fillStyle = ACCENT2;
        const positions = [
          [0, -0.5],
          [-0.55, 0.1],
          [0.55, 0.1],
          [-0.3, 0.7],
          [0.3, 0.7],
          [0, 0.2],
        ];
        for (const [dx, dy] of positions) {
          ctx.beginPath();
          ctx.arc(x + dx * r, y + dy * r, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = "#5b8a3a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - r * 0.7);
        ctx.lineTo(x + r * 0.3, y - r * 1.05);
        ctx.stroke();
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (tnow: number) => {
      const dt = Math.min(0.033, (tnow - last) / 1000);
      last = tnow;
      const ph = phaseRef.current;

      if (ph === "playing") {
        elapsed += dt;
        // move Cleia toward pointer target
        const prevX = cleiaX;
        cleiaX += (targetX - cleiaX) * Math.min(1, dt * 18);
        moving = Math.abs(cleiaX - prevX) > 0.4;

        // spawn
        sinceSpawn += dt;
        if (sinceSpawn >= nextGap) {
          spawn();
          sinceSpawn = 0;
          nextGap = Math.max(0.45, 0.95 - elapsed * 0.01) * (0.7 + Math.random() * 0.7);
        }

        // catch zone (her head/mouth area)
        const zone = {
          x: cleiaX + dogW * 0.1,
          y: dogTop,
          w: dogW * 0.8,
          h: dogH * 0.7,
        };

        for (const it of items) {
          it.vy += 120 * dt;
          it.y += it.vy * dt;
          it.x += it.drift * dt;
          if (it.x < it.r) {
            it.x = it.r;
            it.drift = Math.abs(it.drift);
          } else if (it.x > W - it.r) {
            it.x = W - it.r;
            it.drift = -Math.abs(it.drift);
          }
        }

        // resolve catches / misses
        const survivors: Item[] = [];
        for (const it of items) {
          const caught =
            it.y + it.r * 0.6 >= zone.y &&
            it.y - it.r * 0.6 <= zone.y + zone.h &&
            it.x >= zone.x &&
            it.x <= zone.x + zone.w;
          if (caught) {
            if (it.type === "grape") {
              lives -= 1;
              sadT = 0.6;
              flashT = 0.25;
              navigator.vibrate?.(30);
              pops.push({ x: it.x, y: it.y, t: 0.9, glyph: "yuck!!" });
              if (lives <= 0) {
                setFinalScore(scoreVal);
                onGameOver(scoreVal);
                setPhase("over");
              }
            } else {
              scoreVal += POINTS[it.type];
              navigator.vibrate?.(8);
              pops.push({
                x: it.x,
                y: it.y,
                t: 0.8,
                glyph: it.type === "charm" ? "+5" : it.type === "heart" ? "+2" : "+1",
              });
            }
            continue; // consumed
          }
          if (it.y - it.r > H) continue; // fell off, drop it
          survivors.push(it);
        }
        items = survivors;

        if (sadT > 0) sadT -= dt;
        if (flashT > 0) flashT -= dt;
        animT += dt;
        if (animT > 0.1) {
          animT = 0;
          frameTog = !frameTog;
        }
      }

      // pops always animate out
      for (const p of pops) p.t -= dt;
      pops = pops.filter((p) => p.t > 0);

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);

      // grape-catch red flash
      if (flashT > 0) {
        ctx.fillStyle = `rgba(229,72,77,${(flashT / 0.25) * 0.28})`;
        ctx.fillRect(0, 0, W, H);
      }

      for (const it of items) drawItem(it);

      // Cleia
      let frame: CleiaFrame = "idle";
      if (ph === "over") frame = "sad";
      else if (sadT > 0) frame = "sad";
      else if (moving && ph === "playing") frame = frameTog ? "trot2" : "trot1";
      drawCleia(ctx, cleiaX, dogTop, dp, { frame });

      // score pops
      for (const p of pops) {
        ctx.globalAlpha = Math.min(1, p.t / 0.8);
        ctx.fillStyle = p.glyph === "yuck!!" ? "#e5484d" : ACCENT;
        ctx.font = `bold ${p.glyph === "yuck!!" ? 15 : 17}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.glyph, p.x, p.y - (0.8 - p.t) * 30);
        ctx.globalAlpha = 1;
      }

      // HUD: score
      ctx.fillStyle = ACCENT;
      ctx.font = "bold 15px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(scoreVal), W - 14, 24);
      ctx.fillStyle = "rgba(124,111,134,0.9)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`best ${Math.max(best, scoreVal)}`, W - 14, 40);
      // HUD: lives as paws
      ctx.textAlign = "left";
      ctx.font = "15px system-ui, sans-serif";
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.25;
        ctx.fillText("🐾", 12 + i * 22, 24);
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    raf = requestAnimationFrame(loop);

    // input: drag to move; first touch starts
    const setTarget = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      targetX = Math.min(Math.max(clientX - r.left - dogW / 2, 0), Math.max(0, W - dogW));
    };
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      if (phaseRef.current === "ready") start();
      if (phaseRef.current === "playing") setTarget(e.clientX);
    };
    const onMove = (e: PointerEvent) => {
      if (phaseRef.current !== "playing") return;
      setTarget(e.clientX);
    };
    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);

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
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
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
            Drag to move Cleia. Catch treats, dodge grapes 🍇
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

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  const top = y - s * 0.35;
  ctx.moveTo(x, y + s * 0.5);
  ctx.bezierCurveTo(x - s, y - s * 0.2, x - s * 0.5, top - s * 0.5, x, top);
  ctx.bezierCurveTo(x + s * 0.5, top - s * 0.5, x + s, y - s * 0.2, x, y + s * 0.5);
  ctx.closePath();
  ctx.fill();
}
