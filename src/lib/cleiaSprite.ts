// Shared pixel-art data for Cleia the cavapoo, used both by the ambient
// <CleiaDog /> (SVG) and the canvas mini games (drawCleia). Keeping the sprite
// in one place means the arcade dog always matches the one on the page.

export const PALETTE: Record<string, string> = {
  D: "#8a5636", // dark curls / ears
  C: "#e3a86e", // coat (apricot)
  L: "#f4ddbf", // light muzzle / paws
  N: "#2b2020", // nose
  E: "#241a1a", // eyes
  W: "#ffffff", // eye shine
  P: "#ff8aa8", // tongue
  K: "#ec4899", // collar (brand pink)
};

// Each character is one pixel; column index = x, row index = y.
export const SPRITE = [
  "   DD     DD   ",
  "  DDDD   DDDD  ",
  "  DDDDD DDDDD  ",
  "  DDCCCCCCCDD  ",
  " DDCCCCCCCCCDD ",
  " DCCCCCCCCCCCD ",
  " DCCEECCCEECCD ",
  " DCCEWCCCEWCCD ",
  " DCCCLLNLLCCCD ",
  " DCCCCPPCCCCCD ",
  "  DCCCCCCCCCD  ",
  "  DKKKKKKKKD   ",
  "  CCCCCCCCCCC  ",
  "  CCC   CCC    ",
  "  LL     LL    ",
];

// Same pose but with her eyes shut — used while she naps (and as a wince).
export const SLEEP_SPRITE = SPRITE.map((row, y) => {
  if (y === 6) return " DCCCCCCCCCCCD ";
  if (y === 7) return " DCCNNCCCNNCCD ";
  return row;
});

// Tail pixels (drawn in their own group so they can wag), grid coords.
export const TAIL: [number, number][] = [
  [13, 11],
  [14, 10],
  [15, 9],
  [15, 10],
];

// A small "C" charm dangling from her collar.
export const CHARM_FILL: [number, number][] = [
  [6, 11], [7, 11],
  [6, 12],
  [6, 13], [7, 13],
];
export const CHARM_COLOR = "#ffd23f";

export const GRID_W = 17;
export const GRID_H = SPRITE.length;

// ---- Canvas drawing (mini games) ----

export type CleiaFrame = "idle" | "trot1" | "trot2" | "squish" | "sad";

function withLegs(mid: string, paws: string): string[] {
  const s = SPRITE.slice();
  s[13] = mid;
  s[14] = paws;
  return s;
}

// Second trot frame: legs gathered mid-stride so alternating the two reads
// as a little run cycle.
const TROT2_SPRITE = withLegs("   CCC CCC     ", "   LL   LL     ");

function paint(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  pixel: number,
  rows: string[],
) {
  // tail (behind body)
  ctx.fillStyle = PALETTE.C;
  for (const [tx, ty] of TAIL) {
    ctx.fillRect(ox + tx * pixel, oy + ty * pixel, pixel, pixel);
  }
  // body
  for (let ry = 0; ry < rows.length; ry++) {
    const row = rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const fill = PALETTE[row[rx]];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(ox + rx * pixel, oy + ry * pixel, pixel, pixel);
    }
  }
  // collar charm
  ctx.fillStyle = CHARM_COLOR;
  for (const [cx, cy] of CHARM_FILL) {
    ctx.fillRect(ox + cx * pixel, oy + cy * pixel, pixel, pixel);
  }
}

// Draw Cleia into a canvas with her top-left at (x, y). Supports a 2-frame
// trot, a landing "squish", a sad wince, and horizontal flip.
export function drawCleia(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pixel: number,
  opts: { frame?: CleiaFrame; flip?: boolean } = {},
) {
  const { frame = "idle", flip = false } = opts;
  const rows =
    frame === "trot2" ? TROT2_SPRITE : frame === "sad" ? SLEEP_SPRITE : SPRITE;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  if (frame === "squish") {
    // squash-and-stretch anchored at the bottom-center
    const cx = x + (GRID_W * pixel) / 2;
    const by = y + GRID_H * pixel;
    ctx.translate(cx, by);
    ctx.scale(1.14, 0.82);
    ctx.translate(-cx, -by);
  }

  if (flip) {
    ctx.translate(x + GRID_W * pixel, 0);
    ctx.scale(-1, 1);
    paint(ctx, 0, y, pixel, rows);
  } else {
    paint(ctx, x, y, pixel, rows);
  }

  ctx.restore();
}
