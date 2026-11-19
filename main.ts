// NEON... no. World news front page for Thursday 19 November 2026.
// Draws the whole image in code (pure Node 22 stdlib) and writes /output/entry.png.
// Deterministic: fixed layout, fixed seed-free drawing, no time or randomness.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------- CRC32 + PNG
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE.push(c >>> 0);
}

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 5x7 bitmap font
// Each glyph is 7 rows of 5 bits, '1' = ink. Uppercase, digits, punctuation only.
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '\u2022': ['00000', '00000', '01100', '01100', '01100', '00000', '00000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
};

// ---------------------------------------------------------------- canvas
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [16, 29, 51];
const NAVY: RGB = [16, 29, 51];
const GOLD: RGB = [217, 164, 65];
const RED: RGB = [193, 39, 45];
const TEAL: RGB = [27, 122, 110];
const SLATE: RGB = [96, 102, 116];
const WHITE: RGB = [255, 255, 255];
const PANEL: RGB = [255, 255, 255];
const LINE: RGB = [203, 196, 178];

const W = 1024;
const H = 1024;

class Canvas {
  buf = new Uint8Array(W * H * 3);
  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = PAPER[0];
      this.buf[i * 3 + 1] = PAPER[1];
      this.buf[i * 3 + 2] = PAPER[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
  }
  hline(x: number, y: number, w: number, c: RGB, t = 1): void {
    this.rect(x, y, w, t, c);
  }
  vline(x: number, y: number, h: number, c: RGB, t = 1): void {
    this.rect(x, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      this.rect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: [number, number, number, number][] = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        for (let x = Math.ceil(lo); x <= Math.floor(hi); x++) this.px(x, y, c);
      }
    }
  }
  // text ---------------------------------------------------------------
  charWidth(scale: number): number {
    return 6 * scale;
  }
  textWidth(s: string, scale: number): number {
    return s.length * this.charWidth(scale) - scale;
  }
  drawChar(ch: string, x: number, y: number, scale: number, c: RGB): void {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') {
          this.rect(x + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
  }
  drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
    for (let i = 0; i < s.length; i++) {
      this.drawChar(s[i], x + i * this.charWidth(scale), y, scale, c);
    }
  }
  drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
    this.drawText(s, cx - Math.floor(this.textWidth(s, scale) / 2), y, scale, c);
  }
  wrap(text: string, scale: number, maxW: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (this.textWidth(trial, scale) <= maxW) {
        cur = trial;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  drawWrapped(text: string, x: number, y: number, scale: number, c: RGB, maxW: number, lh: number): number {
    const lines = this.wrap(text, scale, maxW);
    for (let i = 0; i < lines.length; i++) this.drawText(lines[i], x, y + i * lh, scale, c);
    return lines.length;
  }
}

// ---------------------------------------------------------------- pictograms
// Each draws a small flat illustration inside the given box (x, y, w, h).
function picSummit(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.rect(x, y, w, h, [232, 222, 196]);
  // sun
  cv.circle(x + w - 52, y + 42, 26, GOLD);
  // skyline
  const base = y + h - 18;
  cv.rect(x + 18, base - 96, 46, 96, NAVY);
  cv.rect(x + 72, base - 130, 52, 130, [38, 58, 92]);
  cv.rect(x + 132, base - 78, 44, 78, NAVY);
  cv.rect(x + 184, base - 108, 48, 108, [38, 58, 92]);
  // windows
  for (let i = 0; i < 4; i++) cv.rect(x + 28, base - 84 + i * 20, 8, 10, GOLD);
  for (let i = 0; i < 5; i++) cv.rect(x + 84, base - 118 + i * 22, 10, 10, GOLD);
  for (let i = 0; i < 3; i++) cv.rect(x + 144, base - 66 + i * 20, 8, 10, GOLD);
  // three flag poles in front
  const flags: RGB[] = [[193, 39, 45], [27, 122, 110], [217, 164, 65]];
  for (let i = 0; i < 3; i++) {
    const fx = x + 30 + i * 26;
    cv.vline(fx, base - 150, 150, INK, 3);
    cv.rect(fx + 3, base - 150, 20, 14, flags[i]);
  }
  cv.rect(x, base, w, 18, [120, 110, 88]);
}

function picTanker(cv: Canvas, x: number, y: number, s: number): void {
  // ship hull
  cv.rect(x + 6, y + 34, s - 12, 18, [38, 58, 92]);
  cv.triangle(x + 6, y + 34, x + 6, y + 52, x + 22, y + 52, [38, 58, 92]);
  cv.rect(x + 14, y + 20, 10, 14, RED);
  cv.rect(x + 30, y + 26, 22, 8, [232, 222, 196]);
  // flames
  cv.triangle(x + 52, y + 34, x + 60, y + 8, x + 68, y + 34, [235, 120, 40]);
  cv.triangle(x + 60, y + 34, x + 66, y + 16, x + 72, y + 34, GOLD);
  // waves
  cv.hline(x + 2, y + 58, s - 4, TEAL, 3);
  cv.hline(x + 10, y + 64, s - 20, TEAL, 3);
}

function picScales(cv: Canvas, x: number, y: number, s: number): void {
  const cx = x + Math.floor(s / 2);
  cv.vline(cx, y + 6, 48, INK, 3);
  cv.hline(x + 8, y + 12, s - 16, INK, 3);
  cv.circle(cx, y + 4, 4, GOLD);
  // left pan
  cv.line(x + 10, y + 13, cx - 12, y + 34, INK, 2);
  cv.line(x + 10, y + 13, cx + 2, y + 34, INK, 2);
  cv.triangle(cx - 20, y + 34, cx + 4, y + 34, cx - 8, y + 46, GOLD);
  // right pan
  cv.line(x + s - 10, y + 13, cx + 12, y + 34, INK, 2);
  cv.line(x + s - 10, y + 13, cx - 2, y + 34, INK, 2);
  cv.triangle(cx - 4, y + 34, cx + 20, y + 34, cx + 8, y + 46, GOLD);
  // base
  cv.hline(cx - 14, y + 56, 28, INK, 3);
}

function picController(cv: Canvas, x: number, y: number, s: number): void {
  cv.rect(x + 8, y + 18, s - 16, 30, [38, 58, 92]);
  cv.circle(x + 12, y + 48, 8, [38, 58, 92]);
  cv.circle(x + s - 12, y + 48, 8, [38, 58, 92]);
  // d-pad
  cv.rect(x + 16, y + 26, 5, 14, WHITE);
  cv.rect(x + 12, y + 30, 13, 5, WHITE);
  // buttons
  cv.circle(x + s - 24, y + 26, 3, GOLD);
  cv.circle(x + s - 32, y + 32, 3, RED);
  cv.circle(x + s - 24, y + 38, 3, TEAL);
  cv.circle(x + s - 16, y + 32, 3, WHITE);
  // sun above
  cv.circle(x + s - 14, y + 8, 7, GOLD);
}

function picChart(cv: Canvas, x: number, y: number, s: number): void {
  const base = y + 56;
  const bars: [number, number, RGB][] = [
    [0, 18, TEAL],
    [1, 28, TEAL],
    [2, 40, GOLD],
    [3, 52, RED],
  ];
  for (const [i, hgt, c] of bars) {
    cv.rect(x + 8 + i * 16, base - hgt, 11, hgt, c);
  }
  cv.line(x + 8, base - 20, x + 60, base - 54, INK, 3);
  cv.triangle(x + 60, base - 54, x + 50, base - 54, x + 60, base - 44, INK);
  cv.hline(x + 4, base, s - 8, INK, 3);
}

// ---------------------------------------------------------------- layout
const cv = new Canvas();
const M = 28; // margin
const CW = W - M * 2; // 968

// ---- masthead: navy band, title + date
cv.rect(0, 0, W, 144, NAVY);
cv.drawTextCentered('THE WORLD TODAY', W / 2, 20, 5, WHITE);
cv.drawTextCentered('THURSDAY 19 NOVEMBER 2026', W / 2, 74, 4, GOLD);
cv.hline(M, 128, CW, GOLD, 2);

// ---- lead story: summit (full width)
const leadY = 158;
const leadH = 254;
cv.rect(M, leadY, CW, leadH, PANEL);
cv.rect(M, leadY, CW, 4, RED);
cv.drawText('DIPLOMACY \u2022 SHENZHEN, CHINA', M + 18, leadY + 16, 2, RED);
cv.drawText('TRUMP, XI AND PUTIN', M + 18, leadY + 46, 5, INK);
cv.drawText('HOLD FIRST THREE-WAY', M + 18, leadY + 88, 5, INK);
cv.drawText('SUMMIT', M + 18, leadY + 130, 5, INK);
cv.drawWrapped(
  'LEADERS OF THE US, CHINA AND RUSSIA MEET IN SHENZHEN WITH NUCLEAR ARMS AND TWO WARS ON THE TABLE.',
  M + 18,
  leadY + 176,
  3,
  SLATE,
  700,
  25,
);
picSummit(cv, M + CW - 268, leadY + 14, 250, 208);

// ---- 2x2 grid of stories
const gridY = 424;
const gridH = 228;
const gridGap = 14;
const bw = Math.floor((CW - gridGap) / 2); // 476
const bh = gridH;

interface Story {
  kicker: string;
  kickerColor: RGB;
  lines: string[];
  summary: string;
  pic: (cv: Canvas, x: number, y: number, s: number) => void;
}

const stories: Story[] = [
  {
    kicker: 'MIDDLE EAST \u2022 STRAIT OF HORMUZ',
    kickerColor: RED,
    lines: ['THREE TANKERS ABLAZE', 'AFTER MINES NEAR HORMUZ'],
    summary: 'OIL TANKERS CATCH FIRE AFTER HITTING MINES EAST OF THE STRAIT OF HORMUZ, IRAN SAYS.',
    pic: picTanker,
  },
  {
    kicker: 'THE HAGUE \u2022 WORLD COURT',
    kickerColor: TEAL,
    lines: ['WORLD COURT RULES', 'ON ROHINGYA CASE'],
    summary: 'JUDGES RULE TODAY ON MYANMAR\'S ALLEGED GENOCIDE OF THE ROHINGYA; 1.2M REFUGEES WATCH.',
    pic: picScales,
  },
  {
    kicker: 'CULTURE \u2022 VIDEO GAMES',
    kickerColor: GOLD,
    lines: ['GTA VI LAUNCHES', 'WORLDWIDE'],
    summary: 'ROCKSTAR\'S BLOCKBUSTER ARRIVES AFTER A 13-YEAR WAIT, TO NEAR-PERFECT REVIEWS.',
    pic: picController,
  },
  {
    kicker: 'BUSINESS \u2022 AI',
    kickerColor: TEAL,
    lines: ['ANTHROPIC IPO RAISES', '$107.3BN, A RECORD'],
    summary: 'THE AI FIRM\'S LISTING TOPS SPACEX\'S RECORD DEBUT; SHARES PRICED AT $83.',
    pic: picChart,
  },
];

for (let i = 0; i < 4; i++) {
  const st = stories[i];
  const bx = M + (i % 2) * (bw + gridGap);
  const by = gridY + Math.floor(i / 2) * (bh + gridGap);
  cv.rect(bx, by, bw, bh, PANEL);
  cv.rect(bx, by, bw, 4, st.kickerColor);
  cv.drawText(st.kicker, bx + 18, by + 18, 2, st.kickerColor);
  // pictogram top-right
  st.pic(cv, bx + bw - 92, by + 12, 76);
  // headline, two lines, scale 3
  cv.drawText(st.lines[0], bx + 18, by + 52, 3, INK);
  cv.drawText(st.lines[1], bx + 18, by + 86, 3, INK);
  // summary, scale 2, wrapped to the text width (leave pictogram clear on line 1 only)
  cv.drawWrapped(st.summary, bx + 18, by + 128, 2, SLATE, bw - 36, 20);
  cv.hline(bx + 18, by + bh - 16, bw - 36, LINE, 1);
}

// ---- footer: also today + sources
const footY = gridY + 2 * bh + gridGap + 16; // 910
cv.rect(M, footY, CW, 88, [232, 222, 196]);
cv.drawText('ALSO TODAY', M + 18, footY + 12, 2, RED);
cv.drawWrapped(
  'MAGNITUDE 5.7 QUAKE JOLTS KUMAMOTO, JAPAN. NO TSUNAMI WARNING ISSUED.',
  M + 18,
  footY + 36,
  3,
  INK,
  CW - 36,
  26,
);
cv.drawTextCentered(
  'SOURCES: NDTV \u2022 THE JAPAN TIMES \u2022 SBS \u2022 THE HINDU \u2022 THE MANILA TIMES',
  W / 2,
  1006,
  2,
  SLATE,
);

// ---------------------------------------------------------------- write it out
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG(W, H, cv.buf));
