"use client";

import { useEffect, useRef, useState } from "react";
import { drawCleia, GRID_H, type CleiaFrame } from "@/lib/cleiaSprite";
import type { GameProps } from "./types";

type Phase = "ready" | "playing" | "over";
interface Pop {
  x: number;
  y: number;
  t: number;
  glyph: string;
  bad: boolean;
}

const ACCENT = "#ec4899";
const ACCENT2 = "#a855f7";
// Sloan letters, like a real eye chart.
const LETTERS = ["C", "D", "E", "F", "L", "N", "O", "P", "T", "Z"];
const ROUND_TIME = 5; // seconds before a round times out

// Focus Ring — the eye chart drifts in and out of focus as the lens dial
// wanders. Tap the moment it snaps sharp: perfect taps build a combo
// multiplier, blurry taps (or dawdling) cost a life. Three lives.
export function FocusGame({ best, onGameOver, onExit }: GameProps) {
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
    let dp = 3;
    let dogH = GRID_H * dp;

    const recalc = () => {
      dp = Math.max(2, Math.round((H * 0.12) / GRID_H));
      dogH = GRID_H * dp;
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
    let scoreVal = 0;
    let lives = 3;
    let combo = 0;
    let round = 0;
    let phaseAngle = 0; // drives the focus oscillation
    let baseSpeed = 1.6;
    let wobbleSeed = 0;
    let roundT = 0;
    let elapsed = 0;
    let chartRows: string[] = [];
    let pops: Pop[] = [];
    let sadT = 0;
    let happyT = 0;
    let flashT = 0;

    const rollChart = () => {
      chartRows = [];
      for (let i = 0; i < 5; i++) {
        const n = Math.min(2 + i, 6);
        let row = "";
        for (let j = 0; j < n; j++)
          row += LETTERS[Math.floor(Math.random() * LETTERS.length)];
        chartRows.push(row);
      }
    };

    const newRound = () => {
      round += 1;
      roundT = 0;
      // start well out of focus and speed up a touch every round
      phaseAngle = Math.PI / 2 + (Math.random() < 0.5 ? 0.6 : -0.6);
      baseSpeed = Math.min(4.2, 1.6 + round * 0.12);
      wobbleSeed = Math.random() * 10;
      rollChart();
    };

    // focus in [-1, 1]; sharpness = 1 - |focus|
    const focusNow = () => Math.sin(phaseAngle);

    const reset = () => {
      recalc();
      scoreVal = 0;
      lives = 3;
      combo = 0;
      round = 0;
      elapsed = 0;
      pops = [];
      sadT = 0;
      happyT = 0;
      flashT = 0;
      newRound();
    };
    reset();

    const start = () => {
      reset();
      setPhase("playing");
    };
    startRef.current = start;

    const chartRect = () => {
      const w = Math.min(W * 0.72, 300);
      const h = Math.min(H * 0.44, w * 1.15);
      return { x: (W - w) / 2, y: H * 0.14, w, h };
    };

    const die = () => {
      setFinalScore(scoreVal);
      onGameOver(scoreVal);
      setPhase("over");
    };

    const loseLife = (x: number, y: number, glyph: string) => {
      lives -= 1;
      combo = 0;
      sadT = 0.7;
      flashT = 0.25;
      navigator.vibrate?.(30);
      pops.push({ x, y, t: 0.9, glyph, bad: true });
      if (lives <= 0) die();
      else newRound();
    };

    const snap = () => {
      const c = chartRect();
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const sharp = 1 - Math.abs(focusNow());
      if (sharp >= 0.88) {
        combo += 1;
        const mult = Math.min(5, combo);
        const pts = 3 * mult;
        scoreVal += pts;
        happyT = 0.5;
        navigator.vibrate?.(8);
        pops.push({
          x: cx,
          y: cy,
          t: 0.85,
          glyph: mult > 1 ? `perfect! +${pts} (x${mult})` : `perfect! +${pts}`,
          bad: false,
        });
        newRound();
      } else if (sharp >= 0.65) {
        combo = 0;
        scoreVal += 1;
        navigator.vibrate?.(5);
        pops.push({ x: cx, y: cy, t: 0.8, glyph: "close +1", bad: false });
        newRound();
      } else {
        loseLife(cx, cy, "too blurry!");
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
        roundT += dt;
        // the dial wanders: base speed plus a slow wobble so the rhythm
        // never becomes a pure metronome
        const speed =
          baseSpeed * (1 + 0.35 * Math.sin(elapsed * 0.9 + wobbleSeed));
        phaseAngle += speed * dt;

        if (roundT >= ROUND_TIME) {
          const c = chartRect();
          loseLife(c.x + c.w / 2, c.y + c.h / 2, "too slow!");
        }

        if (sadT > 0) sadT -= dt;
        if (happyT > 0) happyT -= dt;
        if (flashT > 0) flashT -= dt;
      }

      for (const p of pops) p.t -= dt;
      pops = pops.filter((p) => p.t > 0);

      // ---- draw ----
      ctx.clearRect(0, 0, W, H);

      if (flashT > 0) {
        ctx.fillStyle = `rgba(229,72,77,${(flashT / 0.25) * 0.28})`;
        ctx.fillRect(0, 0, W, H);
      }

      const c = chartRect();
      const sharp = ph === "playing" ? 1 - Math.abs(focusNow()) : 1;
      const blurPx = (1 - sharp) * Math.max(6, c.w * 0.045);

      // chart card (crisp) then letters (blurred by the lens)
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, c.x, c.y, c.w, c.h, 10);
      ctx.fill();
      ctx.strokeStyle = "rgba(168,85,247,0.35)";
      ctx.lineWidth = 2;
      roundRect(ctx, c.x, c.y, c.w, c.h, 10);
      ctx.stroke();

      ctx.save();
      if (blurPx > 0.4) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      ctx.fillStyle = "#241a1a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < chartRows.length; i++) {
        const row = chartRows[i];
        const size = c.h * (0.19 - i * 0.028);
        const y = c.y + c.h * (0.16 + i * 0.19);
        ctx.font = `bold ${Math.round(size)}px ui-monospace, monospace`;
        const track = size * 0.55;
        const total = (row.length - 1) * (size + track);
        for (let j = 0; j < row.length; j++) {
          ctx.fillText(row[j], c.x + c.w / 2 - total / 2 + j * (size + track), y);
        }
      }
      ctx.restore();
      ctx.textBaseline = "alphabetic";

      // the focus ring itself: fills and warms up as the chart sharpens
      const ringR = Math.min(c.w, c.h) * 0.14;
      const ringX = c.x + c.w / 2;
      const ringY = c.y + c.h + ringR + 18;
      ctx.strokeStyle = "rgba(124,111,134,0.35)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = sharp >= 0.88 ? "#22c55e" : sharp >= 0.65 ? ACCENT : ACCENT2;
      ctx.beginPath();
      ctx.arc(
        ringX,
        ringY,
        ringR,
        -Math.PI / 2,
        -Math.PI / 2 + sharp * Math.PI * 2,
      );
      ctx.stroke();
      ctx.fillStyle = "rgba(124,111,134,0.9)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("tap when sharp", ringX, ringY + ringR + 16);

      // round timer as a thin draining bar under the chart
      if (ph === "playing") {
        const tw = c.w * (1 - roundT / ROUND_TIME);
        ctx.fillStyle = "rgba(236,72,153,0.45)";
        ctx.fillRect(c.x + (c.w - tw) / 2, c.y + c.h + 6, tw, 3);
      }

      // Cleia watches from the bottom corner
      let frame: CleiaFrame = "idle";
      if (ph === "over" || sadT > 0) frame = "sad";
      else if (happyT > 0) frame = "squish";
      drawCleia(ctx, W * 0.06, H - dogH - Math.max(8, H * 0.02), dp, { frame });

      // pops
      for (const p of pops) {
        ctx.globalAlpha = Math.min(1, p.t / 0.8);
        ctx.fillStyle = p.bad ? "#e5484d" : ACCENT;
        ctx.font = `bold ${p.bad ? 15 : 16}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(p.glyph, p.x, p.y - (0.85 - p.t) * 30);
        ctx.globalAlpha = 1;
      }

      // HUD: score + combo
      ctx.fillStyle = ACCENT;
      ctx.font = "bold 15px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(scoreVal), W - 14, 24);
      ctx.fillStyle = "rgba(124,111,134,0.9)";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`best ${Math.max(best, scoreVal)}`, W - 14, 40);
      if (combo > 1 && ph === "playing") {
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 11px ui-monospace, monospace";
        ctx.fillText(`combo x${Math.min(5, combo)}`, W - 14, 56);
      }
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

    // input: any tap is a focus snap
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph === "ready") start();
      else if (ph === "playing") snap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      e.preventDefault();
      const ph = phaseRef.current;
      if (ph === "ready") start();
      else if (ph === "playing") snap();
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
            Tap the instant the chart snaps into focus 👓
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
