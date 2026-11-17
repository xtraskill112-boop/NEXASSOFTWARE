/**
 * Procedural illustration engine for NAAMDEV SWEETS. Every product gets an original, on-brand
 * vector illustration generated from its catalogue "art recipe" (kind + colours). Deterministic
 * per slug, so re-running produces identical files.
 */
import type { Art, ArtKind } from "../../../packages/db/prisma/catalog";

type Rng = () => number;
export function rng(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => {
    const c = (n >> s) & 255;
    const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

class Svg {
  defs: string[] = [];
  body: string[] = [];
  private n = 0;
  constructor(public id: string) {}
  uid(p: string) {
    return `${p}${this.id}${this.n++}`;
  }
  radial(stops: [number, string, number?][], cx = 0.35, cy = 0.3, r = 0.8) {
    const id = this.uid("r");
    this.defs.push(`<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`).join("")}</radialGradient>`);
    return `url(#${id})`;
  }
  linear(stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
    const id = this.uid("l");
    this.defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ""}/>`).join("")}</linearGradient>`);
    return `url(#${id})`;
  }
  clip(shape: string) {
    const id = this.uid("c");
    this.defs.push(`<clipPath id="${id}">${shape}</clipPath>`);
    return `url(#${id})`;
  }
  blur(sd: number) {
    const id = this.uid("b");
    this.defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`);
    return `url(#${id})`;
  }
  add(s: string) {
    this.body.push(s);
  }
  render(w: number, h: number, title: string) {
    const t = title.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${t}"><title>${t}</title><defs>${this.defs.join("")}</defs>${this.body.join("")}</svg>`;
  }
}

// ── Scene pieces ──
function background(s: Svg, art: Art, w: number, h: number, r: Rng, alt: boolean) {
  const [a, b] = art.bg;
  s.add(`<rect width="${w}" height="${h}" fill="${s.linear([[0, alt ? b : a], [1, alt ? a : b]], 0, 0, 1, 1)}"/>`);
  // Soft mandala in the corner
  const cx = alt ? w * 0.12 : w * 0.88, cy = h * 0.14, col = shade(b, -0.25);
  let m = `<g opacity="0.16" fill="none" stroke="${col}" stroke-width="2">`;
  for (let i = 1; i <= 4; i++) m += `<circle cx="${cx}" cy="${cy}" r="${i * 42}"/>`;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2, x = cx + Math.cos(ang) * 120, y = cy + Math.sin(ang) * 120;
    m += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="22" ry="9" transform="rotate(${f((ang * 180) / Math.PI)} ${f(x)} ${f(y)})"/>`;
  }
  s.add(m + "</g>");
  // Bokeh
  for (let i = 0; i < 7; i++) s.add(`<circle cx="${f(r() * w)}" cy="${f(r() * h * 0.55)}" r="${f(8 + r() * 26)}" fill="#fff" opacity="${f(0.08 + r() * 0.14)}"/>`);
  s.add(`<circle cx="${w / 2}" cy="${h * 0.6}" r="${w * 0.42}" fill="${s.radial([[0, "#fff", 0.55], [1, "#fff", 0]], 0.5, 0.5, 0.5)}"/>`);
}

function plate(s: Svg, cx: number, cy: number, rx: number, ry: number, style: "brass" | "ceramic" | "leaf" = "brass") {
  s.add(`<ellipse cx="${cx}" cy="${cy + ry * 0.32}" rx="${rx * 1.02}" ry="${ry * 1.05}" fill="#3B1A10" opacity="0.18" filter="${s.blur(14)}"/>`);
  if (style === "leaf") {
    s.add(`<path d="M ${cx - rx} ${cy} Q ${cx - rx * 0.2} ${cy - ry * 1.6} ${cx + rx} ${cy - ry * 0.1} Q ${cx + rx * 0.1} ${cy + ry * 1.5} ${cx - rx} ${cy} Z" fill="${s.linear([[0, "#4E8B3A"], [1, "#2F6B2A"]], 0, 0, 1, 1)}"/>`);
    s.add(`<path d="M ${cx - rx * 0.95} ${cy} Q ${cx} ${cy - ry * 0.1} ${cx + rx * 0.95} ${cy - ry * 0.1}" stroke="#A8D08D" stroke-width="4" fill="none" opacity="0.7"/>`);
    return;
  }
  const rim = style === "brass" ? s.linear([[0, "#F3D27A"], [0.45, "#D9A441"], [1, "#A9772A"]], 0, 0, 1, 1) : s.linear([[0, "#FFFFFF"], [1, "#E9E1D4"]], 0, 0, 0, 1);
  const inner = style === "brass" ? s.radial([[0, "#FBE7B2"], [0.7, "#E8C06A"], [1, "#C8963E"]], 0.45, 0.35, 0.7) : s.radial([[0, "#FFFFFF"], [1, "#F1EBE1"]], 0.45, 0.35, 0.7);
  s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${rim}"/>`);
  s.add(`<ellipse cx="${cx}" cy="${cy - ry * 0.04}" rx="${rx * 0.86}" ry="${ry * 0.8}" fill="${inner}"/>`);
  if (style === "brass") {
    s.add(`<ellipse cx="${cx}" cy="${cy - ry * 0.04}" rx="${rx * 0.93}" ry="${ry * 0.88}" fill="none" stroke="#FFF1C9" stroke-width="2" opacity="0.6" stroke-dasharray="3 9"/>`);
  } else {
    s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.96}" ry="${ry * 0.93}" fill="none" stroke="#8F1D34" stroke-width="4" opacity="0.55"/>`);
  }
}

function shadowUnder(s: Svg, cx: number, cy: number, rx: number) {
  s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.28}" fill="#3B1A10" opacity="0.22" filter="${s.blur(6)}"/>`);
}

function slivers(s: Svg, r: Rng, cx: number, cy: number, spread: number, color: string, count = 6) {
  for (let i = 0; i < count; i++) {
    const x = cx + (r() - 0.5) * spread, y = cy + (r() - 0.5) * spread * 0.45, rot = r() * 180;
    s.add(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(7 + r() * 5)}" ry="${f(2.4 + r() * 1.4)}" fill="${color}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" stroke="${shade(color, -0.3)}" stroke-width="0.8"/>`);
  }
}

function silverLeaf(s: Svg, r: Rng, clip: string, x: number, y: number, w: number, h: number) {
  let g = `<g clip-path="${clip}" opacity="0.55">`;
  for (let i = 0; i < 14; i++) {
    const px = x + r() * w, py = y + r() * h, sz = 10 + r() * 24;
    g += `<path d="M ${f(px)} ${f(py)} l ${f(sz)} ${f(r() * 6 - 3)} l ${f(-r() * 6)} ${f(sz * 0.6)} l ${f(-sz * 0.8)} ${f(r() * 4)} z" fill="${r() > 0.5 ? "#FFFFFF" : "#D7DBE0"}"/>`;
  }
  s.add(g + "</g>");
}

function sphere(s: Svg, r: Rng, cx: number, cy: number, rad: number, art: Art, texture: "boondi" | "grain" | "smooth" | "glossy" | "coconut") {
  const [p, q, g] = art.colors;
  shadowUnder(s, cx, cy + rad * 0.9, rad * 0.95);
  const fill = s.radial([[0, shade(p, 0.45)], [0.45, p], [1, shade(q, -0.15)]], 0.36, 0.3, 0.75);
  s.add(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="${fill}"/>`);
  const cl = s.clip(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}"/>`);
  if (texture === "boondi" || texture === "coconut" || texture === "grain") {
    let t = `<g clip-path="${cl}">`;
    const n = texture === "grain" ? 160 : 120;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const size = texture === "boondi" ? 4 + r() * 3.5 : texture === "coconut" ? 1.4 + r() * 2.5 : 1.2 + r() * 1.6;
      const col = texture === "coconut" ? (r() > 0.5 ? "#FFFFFF" : shade(p, -0.1)) : r() > 0.5 ? shade(p, 0.25) : shade(q, -0.12);
      t += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(size)}" fill="${col}" opacity="${f(0.55 + r() * 0.4)}"/>`;
    }
    s.add(t + "</g>");
  }
  // Specular highlight + rim shadow for volume
  s.add(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="${s.radial([[0.6, "#000", 0], [1, "#3B1A10", 0.35]], 0.4, 0.35, 0.65)}"/>`);
  s.add(`<ellipse cx="${f(cx - rad * 0.32)}" cy="${f(cy - rad * 0.4)}" rx="${f(rad * (texture === "glossy" ? 0.32 : 0.24))}" ry="${f(rad * (texture === "glossy" ? 0.18 : 0.13))}" fill="#fff" opacity="${texture === "glossy" ? 0.75 : 0.4}" transform="rotate(-30 ${f(cx - rad * 0.32)} ${f(cy - rad * 0.4)})"/>`);
  if (g && texture !== "glossy" && texture !== "smooth") slivers(s, r, cx, cy - rad * 0.55, rad * 0.8, g, 3);
}

/** Isometric slab with optional two-tone layers. */
function slab(s: Svg, r: Rng, x: number, y: number, w: number, d: number, h: number, top: string, side: string, opts: { layer2?: string; garnish?: string; silver?: boolean; texture?: "porous" | "flaky" | "layers" | "grain" } = {}) {
  const dx = d * 0.9, dy = d * 0.45;
  shadowUnder(s, x + w / 2 + dx / 2, y + h + dy * 0.6, (w + dx) * 0.55);
  const topPts = `${f(x)},${f(y)} ${f(x + w)},${f(y)} ${f(x + w + dx)},${f(y - dy)} ${f(x + dx)},${f(y - dy)}`;
  const frontPts = `${f(x)},${f(y)} ${f(x + w)},${f(y)} ${f(x + w)},${f(y + h)} ${f(x)},${f(y + h)}`;
  const sidePts = `${f(x + w)},${f(y)} ${f(x + w + dx)},${f(y - dy)} ${f(x + w + dx)},${f(y - dy + h)} ${f(x + w)},${f(y + h)}`;
  if (opts.layer2) {
    s.add(`<polygon points="${frontPts}" fill="${s.linear([[0, shade(side, 0.1)], [0.5, shade(side, 0.1)], [0.5, shade(opts.layer2, -0.05)], [1, shade(opts.layer2, -0.2)]])}"/>`);
    s.add(`<polygon points="${sidePts}" fill="${s.linear([[0, shade(side, -0.08)], [0.5, shade(side, -0.08)], [0.5, shade(opts.layer2, -0.25)], [1, shade(opts.layer2, -0.35)]])}"/>`);
  } else {
    s.add(`<polygon points="${frontPts}" fill="${s.linear([[0, shade(side, 0.05)], [1, shade(side, -0.18)]])}"/>`);
    s.add(`<polygon points="${sidePts}" fill="${shade(side, -0.25)}"/>`);
  }
  s.add(`<polygon points="${topPts}" fill="${s.linear([[0, shade(top, 0.25)], [1, top]], 0, 0, 1, 1)}"/>`);
  const cl = s.clip(`<polygon points="${topPts}"/>`);
  const clF = s.clip(`<polygon points="${frontPts}"/>`);
  if (opts.texture === "porous" || opts.texture === "grain") {
    let t = `<g clip-path="${cl}">`;
    for (let i = 0; i < 60; i++) t += `<circle cx="${f(x + r() * (w + dx))}" cy="${f(y - r() * dy)}" r="${f(opts.texture === "grain" ? 1 + r() * 1.5 : 1.5 + r() * 3)}" fill="${shade(top, -0.22)}" opacity="0.55"/>`;
    s.add(t + "</g>");
    let t2 = `<g clip-path="${clF}">`;
    for (let i = 0; i < 40; i++) t2 += `<circle cx="${f(x + r() * w)}" cy="${f(y + r() * h)}" r="${f(1.5 + r() * 3)}" fill="${shade(side, -0.3)}" opacity="0.5"/>`;
    s.add(t2 + "</g>");
  }
  if (opts.texture === "flaky" || opts.texture === "layers") {
    let t = `<g clip-path="${clF}" stroke="${shade(side, opts.texture === "flaky" ? 0.3 : -0.25)}" stroke-width="1.6" opacity="0.7">`;
    for (let i = 1; i < 8; i++) {
      const yy = y + (h * i) / 8;
      t += `<path d="M ${f(x)} ${f(yy + (r() - 0.5) * 3)} Q ${f(x + w / 2)} ${f(yy + (r() - 0.5) * 6)} ${f(x + w)} ${f(yy + (r() - 0.5) * 3)}" fill="none"/>`;
    }
    s.add(t + "</g>");
  }
  if (opts.silver) silverLeaf(s, r, cl, x, y - dy, w + dx, dy);
  if (opts.garnish) slivers(s, r, x + (w + dx) / 2, y - dy / 2, Math.min(w, 90), opts.garnish, 4);
}

function diamond(s: Svg, r: Rng, cx: number, cy: number, w: number, art: Art, rot: number) {
  const [p, q] = art.colors;
  const hgt = w * 0.42, th = 12;
  const pts = (yoff: number) => `${f(cx - w / 2)},${f(cy + yoff)} ${f(cx)},${f(cy - hgt / 2 + yoff)} ${f(cx + w / 2)},${f(cy + yoff)} ${f(cx)},${f(cy + hgt / 2 + yoff)}`;
  s.add(`<g transform="rotate(${rot} ${cx} ${cy})">`);
  shadowUnder(s, cx, cy + hgt / 2 + 8, w * 0.45);
  s.add(`<polygon points="${pts(th)}" fill="${shade(q, -0.2)}"/>`);
  s.add(`<polygon points="${f(cx - w / 2)},${f(cy)} ${f(cx)},${f(cy + hgt / 2)} ${f(cx)},${f(cy + hgt / 2 + th)} ${f(cx - w / 2)},${f(cy + th)}" fill="${shade(q, -0.08)}"/>`);
  s.add(`<polygon points="${pts(0)}" fill="${s.linear([[0, shade(p, 0.3)], [1, p]], 0, 0, 1, 1)}"/>`);
  silverLeaf(s, r, s.clip(`<polygon points="${pts(0)}"/>`), cx - w / 2, cy - hgt / 2, w, hgt);
  s.add(`</g>`);
}

function bowl(s: Svg, cx: number, cy: number, rx: number, depth: number, fillTop: string, style: "ceramic" | "brass" | "clay" = "ceramic") {
  const ry = rx * 0.32;
  s.add(`<ellipse cx="${cx}" cy="${cy + depth * 0.95}" rx="${rx * 0.9}" ry="${ry * 0.8}" fill="#3B1A10" opacity="0.2" filter="${s.blur(10)}"/>`);
  const body =
    style === "brass" ? s.linear([[0, "#F3D27A"], [0.5, "#D9A441"], [1, "#9C6B22"]], 0, 0, 1, 0)
    : style === "clay" ? s.linear([[0, "#C9744A"], [0.5, "#B05A33"], [1, "#7E3A1F"]], 0, 0, 1, 0)
    : s.linear([[0, "#FFFFFF"], [0.6, "#F4EEE4"], [1, "#D9CFC0"]], 0, 0, 1, 0);
  s.add(`<path d="M ${cx - rx} ${cy} Q ${cx - rx * 0.92} ${cy + depth} ${cx} ${cy + depth} Q ${cx + rx * 0.92} ${cy + depth} ${cx + rx} ${cy} Z" fill="${body}"/>`);
  if (style === "ceramic") s.add(`<path d="M ${cx - rx * 0.97} ${cy + depth * 0.18} Q ${cx} ${cy + depth * 0.42} ${cx + rx * 0.97} ${cy + depth * 0.18}" stroke="#8F1D34" stroke-width="5" fill="none" opacity="0.7"/>`);
  s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${style === "clay" ? "#8E4A28" : style === "brass" ? "#B7832B" : "#EDE5D8"}"/>`);
  s.add(`<ellipse cx="${cx}" cy="${cy + 3}" rx="${rx * 0.92}" ry="${ry * 0.82}" fill="${s.radial([[0, shade(fillTop, 0.25)], [1, shade(fillTop, -0.12)]], 0.45, 0.4, 0.7)}"/>`);
}

// ── Kinds ──
type Drawer = (s: Svg, r: Rng, art: Art, alt: boolean) => void;
const W = 800, H = 800;

const drawers: Record<ArtKind, Drawer> = {
  laddu(s, r, art, alt) {
    plate(s, 400, 560, 320, 130);
    const tex = art.colors[0] === "#FBF7EF" ? "coconut" : art.colors[0].startsWith("#F") ? "boondi" : "grain";
    const pos = alt ? [[300, 470, 105], [500, 480, 110]] : [[300, 455, 80], [500, 455, 80], [215, 530, 86], [400, 540, 92], [585, 530, 86]];
    for (const [x, y, rad] of pos) sphere(s, r, x!, y!, rad!, art, tex as never);
  },
  barfi(s, r, art, alt) {
    plate(s, 400, 575, 330, 130, "ceramic");
    const [p, q, g] = art.colors;
    const two = q !== p && !/^#[0-9A-F]{6}$/i.test("") ? q : undefined;
    const blocks = alt ? [[270, 470, 200, 130, 70]] : [[190, 470, 150, 100, 55], [380, 450, 150, 100, 55], [260, 560, 150, 100, 55], [450, 545, 150, 100, 55]];
    for (const [x, y, w, d, h] of blocks) slab(s, r, x!, y!, w!, d!, h!, p, p, { layer2: two, garnish: g, silver: true, texture: "grain" });
  },
  katli(s, r, art, alt) {
    plate(s, 400, 580, 330, 130, "brass");
    const pos = alt ? [[330, 520, 260, -8], [480, 470, 240, 12]] : [[260, 520, 190, -10], [420, 480, 190, 8], [560, 540, 180, -4], [360, 590, 190, 4], [520, 610, 170, -12]];
    for (const [x, y, w, rot] of pos) diamond(s, r, x!, y!, w!, art, rot!);
  },
  roll(s, r, art, alt) {
    plate(s, 400, 580, 320, 125, "ceramic");
    const [p, q, g] = art.colors;
    const n = alt ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const row = alt ? 0 : Math.floor(i / 3), col = alt ? i : i % 3;
      const cx = 250 + col * 150 + row * 40, cy = 500 + row * 70, rr = alt ? 70 : 54;
      shadowUnder(s, cx, cy + rr * 0.9, rr);
      s.add(`<rect x="${cx - rr}" y="${cy - rr * 0.3}" width="${rr * 2}" height="${rr * 1.05}" rx="${rr * 0.25}" fill="${s.linear([[0, shade(p, 0.1)], [1, shade(p, -0.2)]])}"/>`);
      s.add(`<ellipse cx="${cx}" cy="${cy - rr * 0.3}" rx="${rr}" ry="${rr * 0.55}" fill="${shade(p, 0.2)}"/>`);
      s.add(`<ellipse cx="${cx}" cy="${cy - rr * 0.3}" rx="${rr * 0.55}" ry="${rr * 0.3}" fill="${s.radial([[0, shade(q, 0.2)], [1, q]], 0.5, 0.5, 0.6)}"/>`);
      s.add(`<path d="M ${cx - rr * 0.8} ${cy - rr * 0.3} a ${rr * 0.8} ${rr * 0.44} 0 1 0 ${rr * 1.6} 0" fill="none" stroke="${shade(p, -0.15)}" stroke-width="2" opacity="0.6"/>`);
      silverLeaf(s, r, s.clip(`<rect x="${cx - rr}" y="${cy - rr * 0.3}" width="${rr * 2}" height="${rr}" rx="${rr * 0.25}"/>`), cx - rr, cy - rr * 0.2, rr * 2, rr * 0.8);
      if (g) slivers(s, r, cx, cy - rr * 0.32, rr * 0.4, g, 1);
    }
  },
  peda(s, r, art, alt) {
    plate(s, 400, 575, 320, 125, "leaf");
    const [p, q, g] = art.colors;
    const pos = alt ? [[310, 500, 120], [500, 510, 115]] : [[250, 480, 78], [410, 465, 78], [560, 490, 78], [320, 560, 82], [490, 565, 82]];
    for (const [cx, cy, rr] of pos) {
      shadowUnder(s, cx!, cy! + rr! * 0.45, rr!);
      s.add(`<ellipse cx="${cx}" cy="${cy! + 14}" rx="${rr}" ry="${rr! * 0.48}" fill="${shade(q, -0.15)}"/>`);
      s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr! * 0.48}" fill="${s.radial([[0, shade(p, 0.35)], [0.7, p], [1, q]], 0.4, 0.35, 0.7)}"/>`);
      const cl = s.clip(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr! * 0.48}"/>`);
      let t = `<g clip-path="${cl}">`;
      for (let i = 0; i < 60; i++) t += `<circle cx="${f(cx! + (r() - 0.5) * rr! * 2)}" cy="${f(cy! + (r() - 0.5) * rr!)}" r="${f(1 + r() * 1.6)}" fill="${shade(p, r() > 0.5 ? 0.4 : -0.2)}" opacity="0.6"/>`;
      s.add(t + "</g>");
      s.add(`<ellipse cx="${cx}" cy="${cy! - 2}" rx="${rr! * 0.3}" ry="${rr! * 0.14}" fill="${shade(q, -0.25)}" opacity="0.6"/>`);
      if (g) s.add(`<circle cx="${cx}" cy="${cy! - 4}" r="${rr! * 0.09}" fill="${g}"/>`);
    }
  },
  syrupBalls(s, r, art, alt) {
    const [p] = art.colors;
    const dark = parseInt(p.slice(1, 3), 16) < 0xb0;
    bowl(s, 400, 430, alt ? 300 : 280, 260, dark ? "#C77A1E" : "#F6E7B9", dark ? "brass" : "ceramic");
    const pos = alt ? [[320, 430, 95], [480, 425, 98]] : [[290, 420, 68], [400, 405, 70], [510, 420, 68], [345, 460, 70], [460, 462, 70]];
    for (const [x, y, rad] of pos) sphere(s, r, x!, y!, rad!, art, dark ? "glossy" : "smooth");
    s.add(`<ellipse cx="400" cy="470" rx="250" ry="40" fill="${dark ? "#D88A2A" : "#FFF3D1"}" opacity="0.55"/>`);
  },
  rasmalai(s, r, art, alt) {
    const [p, q, g] = art.colors;
    bowl(s, 400, 440, 300, 230, q, "ceramic");
    const pos = alt ? [[330, 440, 100], [490, 445, 95]] : [[280, 430, 70], [410, 415, 72], [530, 435, 70], [350, 470, 70], [480, 475, 66]];
    for (const [cx, cy, rr] of pos) {
      s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr! * 0.42}" fill="${s.radial([[0, "#FFFFFF"], [0.8, p], [1, shade(p, -0.1)]], 0.4, 0.35, 0.7)}"/>`);
    }
    for (let i = 0; i < 10; i++) {
      const x = 250 + r() * 300, y = 410 + r() * 70;
      s.add(`<path d="M ${f(x)} ${f(y)} l ${f(6 + r() * 6)} ${f(-2 + r() * 4)}" stroke="#D95F0E" stroke-width="2" stroke-linecap="round"/>`);
    }
    slivers(s, r, 400, 440, 260, g, 8);
  },
  jalebi(s, r, art, alt) {
    plate(s, 400, 575, 330, 130, "brass");
    const [p, q, g] = art.colors;
    const pos = alt ? [[330, 490, 110], [490, 500, 105]] : [[260, 500, 78], [420, 480, 82], [570, 510, 75], [330, 570, 80], [500, 580, 78]];
    for (const [cx, cy, size] of pos) {
      shadowUnder(s, cx!, cy! + size! * 0.4, size!);
      let d = "";
      for (let t = 0; t < 4.2 * Math.PI; t += 0.2) {
        const rad = (size! * t) / (4.2 * Math.PI);
        const x = cx! + Math.cos(t) * rad, y = cy! + Math.sin(t) * rad * 0.5;
        d += `${d ? "L" : "M"} ${f(x)} ${f(y)} `;
      }
      s.add(`<path d="${d}" fill="none" stroke="${shade(q, -0.15)}" stroke-width="${f(size! * 0.24)}" stroke-linecap="round" transform="translate(0 6)"/>`);
      s.add(`<path d="${d}" fill="none" stroke="${p}" stroke-width="${f(size! * 0.22)}" stroke-linecap="round"/>`);
      s.add(`<path d="${d}" fill="none" stroke="${g}" stroke-width="${f(size! * 0.07)}" stroke-linecap="round" opacity="0.8" transform="translate(-2 -3)"/>`);
    }
  },
  cubes(s, r, art, alt) {
    plate(s, 400, 580, 330, 130, "ceramic");
    const [p, q, g] = art.colors;
    const tex = p === "#F2D89A" ? "flaky" : p.startsWith("#C") ? "layers" : "porous";
    const blocks = alt ? [[260, 470, 180, 120, 110]] : [[180, 470, 120, 90, 85], [350, 455, 120, 90, 85], [520, 470, 120, 90, 85], [270, 560, 120, 90, 80], [440, 560, 120, 90, 80]];
    for (const [x, y, w, d, h] of blocks) slab(s, r, x!, y!, w!, d!, h!, p, q, { garnish: tex === "flaky" ? g : undefined, texture: tex as never });
  },
  ghevar(s, r, art, alt) {
    plate(s, 400, 590, 330, 125, "brass");
    const [p, q, g] = art.colors;
    const rr = alt ? 230 : 200, cx = 400, cy = 500;
    shadowUnder(s, cx, cy + rr * 0.45, rr);
    s.add(`<ellipse cx="${cx}" cy="${cy + 26}" rx="${rr}" ry="${rr * 0.42}" fill="${shade(p, -0.25)}"/>`);
    s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 0.42}" fill="${p}"/>`);
    const cl = s.clip(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 0.42}"/>`);
    let t = `<g clip-path="${cl}" fill="${shade(p, -0.3)}" opacity="0.7">`;
    for (let i = 0; i < 180; i++) t += `<circle cx="${f(cx + (r() - 0.5) * rr * 2)}" cy="${f(cy + (r() - 0.5) * rr * 0.84)}" r="${f(3 + r() * 6)}"/>`;
    s.add(t + "</g>");
    s.add(`<ellipse cx="${cx}" cy="${cy - 10}" rx="${rr * 0.7}" ry="${rr * 0.26}" fill="${s.radial([[0, "#FFFFFF"], [1, q]], 0.4, 0.35, 0.7)}"/>`);
    slivers(s, r, cx, cy - 12, rr * 0.9, g, 10);
    for (let i = 0; i < 8; i++) s.add(`<path d="M ${f(cx - rr * 0.5 + r() * rr)} ${f(cy - 20 + r() * 20)} l 8 2" stroke="#D95F0E" stroke-width="2"/>`);
  },
  sandesh(s, r, art, alt) {
    plate(s, 400, 580, 320, 125, "ceramic");
    const [p, q, g] = art.colors;
    const pos = alt ? [[320, 500, 105], [490, 505, 100]] : [[250, 480, 70], [400, 465, 72], [550, 485, 70], [320, 560, 74], [480, 565, 72]];
    for (const [cx, cy, rr] of pos) {
      shadowUnder(s, cx!, cy! + rr! * 0.5, rr!);
      let d = "";
      for (let i = 0; i < 8; i++) {
        const a1 = (i / 8) * Math.PI * 2, a2 = ((i + 0.5) / 8) * Math.PI * 2, a3 = ((i + 1) / 8) * Math.PI * 2;
        const pt = (a: number, k: number) => `${f(cx! + Math.cos(a) * rr! * k)} ${f(cy! + Math.sin(a) * rr! * k * 0.55)}`;
        d += `${i === 0 ? "M " + pt(a1, 0.85) : ""} Q ${pt(a2, 1.12)} ${pt(a3, 0.85)} `;
      }
      s.add(`<path d="${d} Z" fill="${shade(q, -0.2)}" transform="translate(0 12)"/>`);
      s.add(`<path d="${d} Z" fill="${s.radial([[0, shade(p, 0.35)], [1, p]], 0.4, 0.35, 0.7)}"/>`);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s.add(`<line x1="${cx}" y1="${cy}" x2="${f(cx! + Math.cos(a) * rr! * 0.8)}" y2="${f(cy! + Math.sin(a) * rr! * 0.44)}" stroke="${shade(q, -0.15)}" stroke-width="2" opacity="0.5"/>`);
      }
      s.add(`<circle cx="${cx}" cy="${cy}" r="${rr! * 0.12}" fill="${g}"/>`);
    }
  },
  bowl(s, r, art, alt) {
    const [p, q, g] = art.colors;
    bowl(s, 400, 420, alt ? 300 : 270, 250, p, "clay");
    const cl = s.clip(`<ellipse cx="400" cy="423" rx="250" ry="70"/>`);
    let t = `<g clip-path="${cl}" fill="none" stroke="${shade(q, -0.1)}" stroke-width="3" opacity="0.6">`;
    for (let i = 0; i < 9; i++) t += `<path d="M ${f(170 + r() * 80)} ${f(400 + i * 6)} Q 400 ${f(380 + r() * 60)} ${f(560 + r() * 70)} ${f(400 + i * 6)}"/>`;
    s.add(t + "</g>");
    slivers(s, r, 400, 420, 240, g, 10);
    for (let i = 0; i < 8; i++) s.add(`<path d="M ${f(300 + r() * 200)} ${f(405 + r() * 30)} l 8 2" stroke="#D95F0E" stroke-width="2"/>`);
  },
  pot(s, r, art, alt) {
    const [clay, yogurt, dark] = art.colors;
    const cx = 400, cy = alt ? 380 : 400, w = alt ? 230 : 200;
    s.add(`<ellipse cx="${cx}" cy="${cy + 300}" rx="${w * 1.1}" ry="45" fill="#3B1A10" opacity="0.2" filter="${s.blur(12)}"/>`);
    s.add(`<path d="M ${cx - w * 0.8} ${cy} C ${cx - w * 1.6} ${cy + 140} ${cx - w * 0.9} ${cy + 300} ${cx} ${cy + 300} C ${cx + w * 0.9} ${cy + 300} ${cx + w * 1.6} ${cy + 140} ${cx + w * 0.8} ${cy} Z" fill="${s.linear([[0, shade(clay, 0.2)], [0.55, clay], [1, shade(dark, -0.1)]], 0, 0, 1, 0)}"/>`);
    s.add(`<path d="M ${cx - w * 1.05} ${cy + 120} Q ${cx} ${cy + 175} ${cx + w * 1.05} ${cy + 120}" stroke="${shade(clay, 0.35)}" stroke-width="6" fill="none" opacity="0.6"/>`);
    s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${w * 0.85}" ry="${w * 0.24}" fill="${shade(dark, -0.1)}"/>`);
    s.add(`<ellipse cx="${cx}" cy="${cy + 6}" rx="${w * 0.75}" ry="${w * 0.19}" fill="${s.radial([[0, shade(yogurt, 0.3)], [0.7, yogurt], [1, "#C88A4A"]], 0.45, 0.4, 0.7)}"/>`);
    s.add(`<path d="M ${cx - 60} ${cy + 4} q 40 -14 90 2" stroke="#fff" stroke-width="5" opacity="0.4" fill="none" stroke-linecap="round"/>`);
    void r;
  },
  dryfruits(s, r, art, alt) {
    const [a, c, pis] = art.colors;
    bowl(s, 400, 420, alt ? 300 : 280, 240, "#7A4A2A", "brass");
    const items: string[] = [];
    for (let i = 0; i < (alt ? 30 : 46); i++) {
      const x = 170 + r() * 460, y = 360 + r() * 90 - Math.abs(x - 400) * 0.12, rot = r() * 360, t = r();
      if (t < 0.4) items.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="20" ry="11" fill="${s.radial([[0, shade(a, 0.3)], [1, shade(a, -0.2)]], 0.4, 0.3, 0.7)}" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`);
      else if (t < 0.75) items.push(`<path d="M ${f(x - 16)} ${f(y)} q 16 -26 32 0 q -6 -10 -16 -8 q -10 -2 -16 8 z" fill="${c}" stroke="${shade(c, -0.25)}" stroke-width="1.5" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`);
      else if (t < 0.9) items.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="12" ry="8" fill="${pis}" stroke="${shade(pis, -0.3)}" stroke-width="1.5" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`);
      else items.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="8" ry="6" fill="#4A1F2E" transform="rotate(${f(rot)} ${f(x)} ${f(y)})"/>`);
    }
    s.add(items.join(""));
  },
  namkeen(s, r, art, alt) {
    const [p, q, g] = art.colors;
    bowl(s, 400, 420, alt ? 300 : 280, 240, shade(p, -0.1), "ceramic");
    let t = "";
    for (let i = 0; i < (alt ? 110 : 160); i++) {
      const x = 160 + r() * 480, y = 360 + r() * 95 - Math.abs(x - 400) * 0.12, len = 14 + r() * 18, a = r() * Math.PI;
      t += `<path d="M ${f(x)} ${f(y)} q ${f(Math.cos(a) * len * 0.5)} ${f(-6 + r() * 12)} ${f(Math.cos(a) * len)} ${f(Math.sin(a) * len * 0.4)}" stroke="${r() > 0.3 ? p : shade(p, -0.2)}" stroke-width="${f(3 + r() * 2)}" stroke-linecap="round" fill="none"/>`;
    }
    for (let i = 0; i < 18; i++) {
      const x = 190 + r() * 420, y = 370 + r() * 70;
      t += r() > 0.4 ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="9" ry="6" fill="${q}" transform="rotate(${f(r() * 180)} ${f(x)} ${f(y)})"/>` : `<path d="M ${f(x)} ${f(y)} q 12 -14 24 0 q -12 8 -24 0" fill="${g}"/>`;
    }
    s.add(t);
  },
  triangles(s, r, art, alt) {
    plate(s, 400, 585, 330, 125, "leaf");
    const [p, q, g] = art.colors;
    const pos = alt ? [[330, 520, 170], [500, 530, 160]] : [[250, 520, 130], [410, 500, 135], [560, 530, 125], [340, 590, 120]];
    for (const [cx, cy, sz] of pos) {
      shadowUnder(s, cx!, cy! + sz! * 0.3, sz! * 0.6);
      s.add(`<path d="M ${cx! - sz! * 0.55} ${cy! + sz! * 0.25} L ${cx} ${cy! - sz! * 0.6} L ${cx! + sz! * 0.55} ${cy! + sz! * 0.25} Q ${cx} ${cy! + sz! * 0.42} ${cx! - sz! * 0.55} ${cy! + sz! * 0.25} Z" fill="${s.linear([[0, shade(p, 0.25)], [1, shade(q, -0.1)]], 0, 0, 1, 1)}"/>`);
      s.add(`<path d="M ${cx} ${cy! - sz! * 0.6} L ${cx! + sz! * 0.55} ${cy! + sz! * 0.25} Q ${cx! + sz! * 0.1} ${cy! + sz! * 0.38} ${cx! + sz! * 0.05} ${cy! + sz! * 0.33} Z" fill="${shade(q, -0.18)}" opacity="0.7"/>`);
      for (let i = 0; i < 14; i++) s.add(`<circle cx="${f(cx! + (r() - 0.5) * sz! * 0.6)}" cy="${f(cy! + (r() - 0.3) * sz! * 0.4)}" r="${f(1.5 + r() * 2)}" fill="${shade(p, -0.2)}" opacity="0.5"/>`);
    }
    bowl(s, 620, 610, 70, 50, g, "ceramic");
  },
  rounds(s, r, art, alt) {
    plate(s, 400, 580, 330, 125, "brass");
    const [p, q, g] = art.colors;
    const pos = alt ? [[320, 500, 120], [500, 510, 115]] : [[250, 480, 80], [410, 465, 82], [565, 490, 80], [330, 565, 82], [495, 570, 80]];
    for (const [cx, cy, rr] of pos) {
      shadowUnder(s, cx!, cy! + rr! * 0.5, rr!);
      s.add(`<ellipse cx="${cx}" cy="${cy! + 14}" rx="${rr}" ry="${rr! * 0.52}" fill="${shade(q, -0.2)}"/>`);
      s.add(`<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr! * 0.52}" fill="${s.radial([[0, shade(p, 0.35)], [0.8, p], [1, q]], 0.4, 0.35, 0.7)}"/>`);
      for (let i = 0; i < 22; i++) s.add(`<circle cx="${f(cx! + (r() - 0.5) * rr! * 1.6)}" cy="${f(cy! + (r() - 0.5) * rr! * 0.8)}" r="${f(1.2 + r() * 2.2)}" fill="${g}" opacity="0.55"/>`);
      s.add(`<path d="M ${cx! - rr! * 0.6} ${cy! - rr! * 0.15} q ${rr! * 0.6} ${-rr! * 0.3} ${rr! * 1.2} 0" stroke="#fff" stroke-width="3" fill="none" opacity="0.35"/>`);
    }
  },
  dhokla(s, r, art, alt) {
    plate(s, 400, 585, 330, 125, "ceramic");
    const [p, q, g] = art.colors;
    const blocks = alt ? [[250, 480, 190, 120, 95]] : [[180, 470, 120, 90, 70], [350, 455, 120, 90, 70], [520, 470, 120, 90, 70], [270, 560, 120, 90, 66], [440, 560, 120, 90, 66]];
    for (const [x, y, w, d, h] of blocks) {
      slab(s, r, x!, y!, w!, d!, h!, p, q, { texture: "porous" });
      for (let i = 0; i < 10; i++) s.add(`<circle cx="${f(x! + r() * (w! + d! * 0.9))}" cy="${f(y! - r() * d! * 0.45)}" r="2.6" fill="#1F1414"/>`);
      s.add(`<path d="M ${f(x! + 20 + r() * 40)} ${f(y! - 10)} q 20 -10 40 -4" stroke="${g}" stroke-width="5" stroke-linecap="round" fill="none"/>`);
    }
  },
  cake(s, r, art, alt) {
    const [p, q, g] = art.colors;
    plate(s, 400, 610, 320, 110, "ceramic");
    const cx = 400, top = alt ? 330 : 360, rx = alt ? 240 : 220, ry = rx * 0.32, h = alt ? 230 : 200;
    s.add(`<path d="M ${cx - rx} ${top} L ${cx - rx} ${top + h} A ${rx} ${ry} 0 0 0 ${cx + rx} ${top + h} L ${cx + rx} ${top} Z" fill="${s.linear([[0, shade(p, -0.12)], [0.5, p], [1, shade(p, -0.25)]], 0, 0, 1, 0)}"/>`);
    for (let i = 1; i < 3; i++) s.add(`<path d="M ${cx - rx} ${top + (h * i) / 3} A ${rx} ${ry} 0 0 0 ${cx + rx} ${top + (h * i) / 3}" stroke="${shade(q, -0.1)}" stroke-width="6" fill="none" opacity="0.6"/>`);
    let drip = `M ${cx - rx} ${top}`;
    for (let i = 0; i <= 14; i++) {
      const x = cx - rx + (2 * rx * i) / 14, yy = top + ry * Math.sin((Math.PI * i) / 14) + (i % 2 ? 26 + r() * 30 : 8);
      drip += ` L ${f(x)} ${f(yy)}`;
    }
    s.add(`<path d="${drip} L ${cx + rx} ${top} Z" fill="${q}"/>`);
    s.add(`<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="${s.radial([[0, shade(q, 0.3)], [1, q]], 0.45, 0.4, 0.7)}"/>`);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, x = cx + Math.cos(a) * rx * 0.72, y = top + Math.sin(a) * ry * 0.72;
      s.add(`<circle cx="${f(x)}" cy="${f(y)}" r="14" fill="${s.radial([[0, "#FFFFFF"], [1, shade(p, 0.1)]], 0.4, 0.3, 0.7)}"/>`);
    }
    slivers(s, r, cx, top, rx * 0.8, g, 12);
  },
  hamper(s, r, art, alt) {
    const [box, ribbon, inner] = art.colors;
    const x = alt ? 190 : 210, y = alt ? 360 : 380, w = alt ? 420 : 380, d = 170, h = alt ? 230 : 210;
    shadowUnder(s, x + w / 2 + 60, y + h + 40, w * 0.65);
    const dx = d * 0.9, dy = d * 0.45;
    s.add(`<polygon points="${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}" fill="${s.linear([[0, shade(box, 0.08)], [1, shade(box, -0.2)]])}"/>`);
    s.add(`<polygon points="${x + w},${y} ${x + w + dx},${y - dy} ${x + w + dx},${y - dy + h} ${x + w},${y + h}" fill="${shade(box, -0.32)}"/>`);
    s.add(`<polygon points="${x},${y} ${x + w},${y} ${x + w + dx},${y - dy} ${x + dx},${y - dy}" fill="${s.linear([[0, shade(box, 0.2)], [1, box]], 0, 0, 1, 1)}"/>`);
    // Gold pattern on the front
    let pat = `<g opacity="0.35" stroke="${ribbon}" fill="none" stroke-width="2">`;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) pat += `<path d="M ${x + 30 + i * 80} ${y + 40 + j * 65} l 14 -14 l 14 14 l -14 14 z"/>`;
    s.add(pat + "</g>");
    // Ribbons
    s.add(`<rect x="${x + w * 0.45}" y="${y}" width="34" height="${h}" fill="${s.linear([[0, shade(ribbon, 0.3)], [1, ribbon]], 0, 0, 1, 0)}"/>`);
    s.add(`<polygon points="${x + w * 0.45},${y} ${x + w * 0.45 + 34},${y} ${x + w * 0.45 + 34 + dx},${y - dy} ${x + w * 0.45 + dx},${y - dy}" fill="${shade(ribbon, 0.2)}"/>`);
    s.add(`<polygon points="${x + dx * 0.45},${y - dy * 0.45 - 14} ${x + w + dx * 0.45},${y - dy * 0.45 - 14} ${x + w + dx * 0.55},${y - dy * 0.55 + 14} ${x + dx * 0.55},${y - dy * 0.55 + 14}" fill="${shade(ribbon, 0.1)}" opacity="0.9"/>`);
    const bx = x + w * 0.45 + 17 + dx / 2, by = y - dy / 2;
    s.add(`<path d="M ${bx} ${by} C ${bx - 90} ${by - 90} ${bx - 120} ${by + 10} ${bx} ${by} Z" fill="${shade(ribbon, 0.15)}" stroke="${shade(ribbon, -0.2)}" stroke-width="2"/>`);
    s.add(`<path d="M ${bx} ${by} C ${bx + 90} ${by - 90} ${bx + 120} ${by + 10} ${bx} ${by} Z" fill="${shade(ribbon, 0.05)}" stroke="${shade(ribbon, -0.2)}" stroke-width="2"/>`);
    s.add(`<circle cx="${bx}" cy="${by}" r="16" fill="${shade(ribbon, -0.05)}"/>`);
    // Tag
    s.add(`<g transform="rotate(-12 ${x + 70} ${y + h - 60})"><rect x="${x + 30}" y="${y + h - 90}" width="96" height="56" rx="10" fill="${inner}" stroke="${ribbon}" stroke-width="3"/><text x="${x + 78}" y="${y + h - 56}" font-family="Georgia,serif" font-size="18" font-weight="700" fill="${box}" text-anchor="middle" letter-spacing="2">NDS</text></g>`);
    void r;
  },
  combo(s, r, art, alt) {
    const [a, b, c] = art.colors;
    plate(s, 400, 590, 340, 120, "brass");
    const laddu: Art = { kind: "laddu", colors: [a, shade(a, -0.2), "#7FA34A"], bg: art.bg };
    const peda: Art = { kind: "peda", colors: [b, shade(b, -0.2), c], bg: art.bg };
    sphere(s, r, alt ? 300 : 270, 500, alt ? 95 : 80, laddu, "boondi");
    sphere(s, r, alt ? 470 : 400, 485, alt ? 90 : 76, laddu, "boondi");
    if (!alt) sphere(s, r, 330, 575, 78, laddu, "boondi");
    slab(s, r, alt ? 470 : 460, 560, 120, 80, 60, b, shade(b, -0.1), { garnish: c, texture: "grain" });
    s.add(`<g transform="translate(${alt ? 560 : 600} 430) rotate(10)"><rect x="-60" y="-80" width="120" height="150" rx="16" fill="${c}"/><rect x="-60" y="-80" width="120" height="34" rx="16" fill="${shade(c, -0.2)}"/><text x="0" y="10" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#FFF3DA" text-anchor="middle" letter-spacing="2">NDS</text><text x="0" y="36" font-family="Arial" font-size="11" fill="#FFE7C2" text-anchor="middle" letter-spacing="1">COMBO</text></g>`);
    void peda;
  },
};

export function productSvg(slug: string, name: string, art: Art, alt = false): string {
  const s = new Svg(slug.replace(/[^a-z0-9]/g, "").slice(0, 10) + (alt ? "a" : ""));
  const r = rng(slug + (alt ? ":alt" : ""));
  background(s, art, W, H, r, alt);
  s.add(`<g transform="translate(400 495) scale(1.18) translate(-400 -540)">`);
  drawers[art.kind](s, r, art, alt);
  s.add(`</g>`);
  return s.render(W, H, name);
}

export function categorySvg(slug: string, name: string, art: Art, accent: string): string {
  const s = new Svg("cat" + slug.replace(/[^a-z0-9]/g, "").slice(0, 10));
  const r = rng("cat:" + slug);
  s.add(`<rect width="${W}" height="${H}" fill="${s.radial([[0, shade(accent, 0.75)], [1, shade(accent, 0.35)]], 0.5, 0.4, 0.75)}"/>`);
  s.add(`<g transform="translate(0 -40)">`);
  drawers[art.kind](s, r, art, true);
  s.add(`</g>`);
  return s.render(W, H, name);
}

export function collectionSvg(slug: string, name: string, arts: Art[], theme: string): string {
  const s = new Svg("col" + slug.replace(/[^a-z0-9]/g, "").slice(0, 10));
  const r = rng("col:" + slug);
  const bg = theme === "maroon" ? ["#52101F", "#8F1D34"] : ["#B24C08", "#F57F0E"];
  s.add(`<rect width="1600" height="800" fill="${s.linear([[0, bg[0]!], [1, bg[1]!]], 0, 0, 1, 1)}"/>`);
  for (let i = 0; i < 3; i++) {
    const art = arts[i % arts.length]!;
    s.add(`<g transform="translate(${600 + i * 300} ${150 + (i % 2) * 70}) scale(${i === 1 ? 0.66 : 0.58})">`);
    const sub = new Svg(`s${i}${slug.slice(0, 6)}`);
    drawers[art.kind](sub, r, art, false);
    s.defs.push(...sub.defs);
    s.add(sub.body.join(""));
    s.add(`</g>`);
  }
  return s.render(1600, 800, name);
}

// ── Brand emblem ──
export function emblemSvg(opts: { size?: number; background?: boolean; maskable?: boolean } = {}): string {
  const size = opts.size ?? 512;
  const s = new Svg("logo");
  const pad = opts.maskable ? 0.18 : 0.06;
  const scale = (1 - pad * 2) * size / 512;
  if (opts.background) s.add(`<rect width="${size}" height="${size}" rx="${opts.maskable ? 0 : size * 0.22}" fill="${s.linear([[0, "#6E1528"], [1, "#2E0711"]], 0, 0, 1, 1)}"/>`);
  s.add(`<g transform="translate(${size * pad} ${size * pad}) scale(${scale})">`);
  const arch = "M256 28 C 300 70, 372 86, 400 150 C 424 206, 424 250, 424 300 L 424 470 Q 424 484 410 484 L 102 484 Q 88 484 88 470 L 88 300 C 88 250, 88 206, 112 150 C 140 86, 212 70, 256 28 Z";
  if (!opts.background) s.add(`<path d="${arch}" fill="${s.linear([[0, "#8F1D34"], [1, "#52101F"]], 0, 0, 0.6, 1)}"/>`);
  s.add(`<path d="${arch}" fill="none" stroke="#F3C969" stroke-width="10"/>`);
  s.add(`<path d="M256 70 C 292 104, 350 118, 372 168 C 392 214, 392 254, 392 300 L 392 452 L 120 452 L 120 300 C 120 254, 120 214, 140 168 C 162 118, 220 104, 256 70 Z" fill="none" stroke="#F3C969" stroke-width="3" opacity="0.6"/>`);
  // Laddu / sun
  s.add(`<circle cx="256" cy="268" r="92" fill="${s.radial([[0, "#FFD39C"], [0.5, "#F59E1B"], [1, "#B24C08"]], 0.36, 0.3, 0.8)}"/>`);
  const r = rng("emblem");
  let dots = "";
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 84;
    dots += `<circle cx="${f(256 + Math.cos(a) * d)}" cy="${f(268 + Math.sin(a) * d)}" r="${f(4 + r() * 3)}" fill="${r() > 0.5 ? "#FFC46B" : "#D9760C"}" opacity="0.55"/>`;
  }
  s.add(dots);
  s.add(`<ellipse cx="226" cy="232" rx="26" ry="14" fill="#fff" opacity="0.45" transform="rotate(-30 226 232)"/>`);
  // Lotus base
  s.add(`<path d="M150 400 Q 200 340 256 380 Q 312 340 362 400 Q 306 420 256 404 Q 206 420 150 400 Z" fill="#F3C969"/>`);
  s.add(`<path d="M206 392 Q 256 318 306 392 Q 256 410 206 392 Z" fill="#FFE7A8"/>`);
  s.add(`<path d="M120 436 L 392 436" stroke="#F3C969" stroke-width="6" stroke-linecap="round"/>`);
  s.add(`</g>`);
  return s.render(size, size, "NAAMDEV SWEETS");
}
