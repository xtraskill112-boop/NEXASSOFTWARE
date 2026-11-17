#!/usr/bin/env python3
"""JeevikaSacredArtIN - 50-second 9:16 photo-motion brand film.

Every frame is built from the brand's real product photos (background-removed
cutouts and sharpened crops, never redrawn by AI), procedural temple backdrops,
light, particles and gold typography, then encoded with ffmpeg.

  python3 render_film.py ASSETS out.mp4 [--scale 1.0] [--workers 4]
  python3 render_film.py ASSETS stills_dir --stills 2,5,9.5,...   (PNG stills)

ASSETS layout: cut/<SKU>.png (RGBA cutouts), up/<name>.png (sharpened photos),
fonts/ (Cinzel, Cormorant Garamond). See SHOTS below for the exact files used.
"""
import argparse, functools, math, os, subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

FPS, DUR = 30, 50.0
NF = int(FPS * DUR)
BRAND = "JEEVIKASACREDARTIN"
GOLD = np.array((1.0, 0.80, 0.46), np.float32)
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")


# ---------------------------------------------------------------- helpers
def sstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ease(t):
    t = min(max(t, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * t)


_WOB = {}
def wob(t, seed, speed=1.0):
    """Smooth pseudo-random wobble in roughly [-1, 1]."""
    if seed not in _WOB:
        r = np.random.default_rng(seed)
        _WOB[seed] = (r.uniform(0, 2 * math.pi, 4), r.uniform(0.5, 1.8, 4))
    ph, fr = _WOB[seed]
    return sum(math.sin(2 * math.pi * f * speed * t + p) for f, p in zip(fr, ph)) / 2.2


def fractal(w, h, seed, octaves=(5, 10, 20, 40, 80), falloff=0.55, stretch=1.0):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32); amp, tot = 1.0, 0.0
    for cells in octaves:
        gw = max(2, cells); gh = max(2, int(cells * h / w / stretch))
        g = r.standard_normal((gh, gw)).astype(np.float32)
        acc += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp; amp *= falloff
    acc /= tot
    return acc / (np.abs(acc).max() + 1e-6)


@functools.lru_cache(maxsize=64)
def _gauss(r):
    k = int(r * 2.6) + 1
    y, x = np.mgrid[-k:k + 1, -k:k + 1].astype(np.float32)
    return np.exp(-(x * x + y * y) / (2 * r * r))


def gauss_sprite(r):
    return _gauss(round(float(r) * 2) / 2)


def add_patch(img, patch, cx, cy):
    """Additively blend a (h, w[, 3]) patch centred at (cx, cy), clipped to img."""
    ph, pw = patch.shape[:2]
    x0, y0 = int(round(cx - pw / 2)), int(round(cy - ph / 2))
    x1, y1 = x0 + pw, y0 + ph
    H, W = img.shape[:2]
    cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
    if cx0 >= cx1 or cy0 >= cy1:
        return
    p = patch[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
    if p.ndim == 2:
        p = p[..., None]
    img[cy0:cy1, cx0:cx1] += p


def over(img, rgb, a, x0, y0):
    """Alpha-composite rgb (h,w,3) with alpha a (h,w) at top-left (x0, y0)."""
    h, w = a.shape
    H, W = img.shape[:2]
    cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
    if cx0 >= cx1 or cy0 >= cy1:
        return
    aa = a[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0, None]
    img[cy0:cy1, cx0:cx1] = img[cy0:cy1, cx0:cx1] * (1 - aa) + rgb[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0] * aa


def unsharp(img, sigma, amount):
    return np.clip(img + amount * (img - cv2.GaussianBlur(img, (0, 0), sigma)), 0, 1)


class Assets:
    def __init__(self, root):
        self.root = root

    def rgba(self, rel):
        im = cv2.imread(os.path.join(self.root, rel), cv2.IMREAD_UNCHANGED)
        if im is None:
            raise FileNotFoundError(rel)
        if im.ndim == 2 or im.shape[2] == 3:
            im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGR) if im.ndim == 2 else im
            im = np.dstack([im, np.full(im.shape[:2], 255, np.uint8)])
        return im[..., [2, 1, 0, 3]].astype(np.float32) / 255

    def rgb(self, rel):
        return self.rgba(rel)[..., :3].copy()


# ---------------------------------------------------------------- the film
class Film:
    def __init__(self, assets, scale=1.0):
        self.A = assets
        self.s = scale
        self.W = int(2160 * scale) // 2 * 2
        self.H = int(3840 * scale) // 2 * 2
        self.BW = int(self.W * 1.12) // 2 * 2       # padded stills leave room for camera moves
        self.BH = int(self.H * 1.12) // 2 * 2
        self._cache, self._order = {}, []
        self._coord = {}
        self._text = {}
        y, x = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        x /= self.W; y /= self.H
        self.vignette = (1 - 0.55 * np.clip(((x - 0.5) / 0.62) ** 2 + ((y - 0.5) / 0.66) ** 2, 0, 1) ** 1.4)[..., None]
        r = np.random.default_rng(99)
        self.grain = (r.standard_normal((self.H // 2, self.W // 2)).astype(np.float32) * 0.018)
        haze = fractal(self.W // 4, self.H // 2, 7, octaves=(3, 6, 12, 24), stretch=3.0)
        self.haze = np.clip(haze * 1.6 - 0.15, 0, 1)
        self._init_dust()
        self._init_petals()
        self.leak = np.exp(-(((x - 0.5) / 0.45) ** 2 + ((y - 0.45) / 0.30) ** 2))[..., None] * GOLD
        self.endglow = np.exp(-(((x - 0.5) / 0.42) ** 2 + ((y - 0.62) / 0.34) ** 2))[..., None] * GOLD
        self.flame_base = self._flame_sprite()

    # ------------------------------------------------------------ caching
    def cached(self, key, fn):
        if key not in self._cache:
            self._cache[key] = fn()
            self._order.append(key)
            if len(self._order) > 4:
                self._cache.pop(self._order.pop(0), None)
        return self._cache[key]

    def coords(self, h, w):
        k = (h, w)
        if k not in self._coord:
            y, x = np.mgrid[0:h, 0:w].astype(np.float32)
            self._coord[k] = (x / w, y / h)
        return self._coord[k]

    # ------------------------------------------------------------ backdrops
    def alcove(self, seed, glow_rgb=(0.34, 0.19, 0.07), plinth=True):
        BW, BH, s = self.BW, self.BH, self.s
        x, y = self.coords(BH, BW)
        img = np.empty((BH, BW, 3), np.float32); img[:] = (0.028, 0.020, 0.013)
        g = np.exp(-(((x - 0.5) / 0.34) ** 2 + ((y - 0.46) / 0.27) ** 2))
        img += g[..., None] * np.array(glow_rgb, np.float32)
        tex = cv2.resize(fractal(BW // 4, BH // 4, seed), (BW, BH), interpolation=cv2.INTER_CUBIC)
        img *= (1 + 0.22 * tex)[..., None]
        # recessed arch niche with a gold rim lit from the upper left
        cx, half, top, bot = 0.5, 0.31, 0.10, 0.705
        ry = half * BW / BH
        inside = ((np.abs(x - cx) < half) & (y > top + ry) & (y < bot)) | \
                 ((((x - cx) * BW) ** 2 + ((y - (top + ry)) * BH) ** 2 < (half * BW) ** 2) & (y <= top + ry))
        m = cv2.GaussianBlur(inside.astype(np.float32), (0, 0), 5 * s)
        k = int(14 * s) | 1
        edge = cv2.GaussianBlur(np.clip(cv2.dilate(m, np.ones((k, k), np.uint8)) - m, 0, 1), (0, 0), 3 * s)
        img *= (1 - 0.32 * m)[..., None]
        light = np.clip(1.25 - y * 1.1 - (x - 0.3) * 0.5, 0.15, 1.0)
        img += (edge * light)[..., None] * np.array((0.26, 0.17, 0.07), np.float32)
        if plinth:
            pl, pr, pt, pf, pb = 0.5 - 0.29, 0.5 + 0.29, 0.700, 0.718, 0.93
            top_m = ((x > pl) & (x < pr) & (y >= pt) & (y < pf)).astype(np.float32)
            front = ((x > pl) & (x < pr) & (y >= pf) & (y < pb)).astype(np.float32)
            aa = lambda a: cv2.GaussianBlur(a, (0, 0), 1.2 * s)
            top_m, front = aa(top_m), aa(front)
            tcol = np.stack([0.085 + 0.05 * (y - pt) / (pf - pt)] * 3, -1) * np.array((1.0, 0.82, 0.62), np.float32)
            fcol = np.empty_like(img); fcol[:] = (0.016, 0.014, 0.012)
            fcol += (0.06 * np.exp(-((y - pf - 0.014) / 0.012) ** 2))[..., None] * np.array((1, 0.8, 0.55), np.float32)
            fcol *= (1 - 0.6 * np.clip((np.abs(x - 0.5) / 0.29) ** 4, 0, 1))[..., None]
            img = img * (1 - top_m[..., None]) + tcol * top_m[..., None]
            img = img * (1 - front[..., None]) + fcol * front[..., None]
            spec = np.exp(-((y - pf) / (0.0016)) ** 2) * ((x > pl) & (x < pr))
            img += cv2.GaussianBlur(spec.astype(np.float32), (0, 0), 1.0 * s)[..., None] * np.array((0.55, 0.40, 0.18), np.float32)
        return img

    def temple(self, seed):
        """Night temple sanctum: returns (ambient, lamp_lit_additive) layers."""
        BW, BH, s = self.BW, self.BH, self.s
        x, y = self.coords(BH, BW)
        base = np.empty((BH, BW, 3), np.float32); base[:] = (0.020, 0.014, 0.010)
        tex = cv2.resize(fractal(BW // 4, BH // 4, seed), (BW, BH), interpolation=cv2.INTER_CUBIC)
        base *= (1 + 0.25 * tex)[..., None]
        lit = np.zeros_like(base)
        # carved pillars, out of focus
        pil = np.zeros((BH, BW), np.float32)
        for xc in (0.085, 0.915):
            pil += ((np.abs(x - xc) < 0.075) & (y < 0.86)).astype(np.float32)
        bands = 0.75 + 0.25 * (np.sin(y * 2 * math.pi * 11) > 0.65)
        pil = cv2.GaussianBlur(pil * bands, (0, 0), 9 * s)
        lit += pil[..., None] * np.array((0.10, 0.07, 0.04), np.float32)
        # hanging brass bells, far behind and soft
        bell = Image.new("L", (BW, BH), 0); d = ImageDraw.Draw(bell)
        for bx, by, bs in ((0.27, 0.115, 0.050), (0.50, 0.075, 0.062), (0.73, 0.125, 0.046)):
            X, Y, S = bx * BW, by * BH, bs * BW
            d.line([(X, 0), (X, Y - S * 0.55)], fill=120, width=max(2, int(5 * s)))
            d.polygon([(X - S * 0.18, Y - S * 0.55), (X + S * 0.18, Y - S * 0.55), (X + S * 0.32, Y - S * 0.1),
                       (X + S * 0.55, Y + S * 0.45), (X - S * 0.55, Y + S * 0.45), (X - S * 0.32, Y - S * 0.1)], fill=255)
        bm = cv2.GaussianBlur(np.asarray(bell, np.float32) / 255, (0, 0), 12 * s)
        lit += bm[..., None] * np.array((0.30, 0.20, 0.08), np.float32)
        # floor
        floor = sstep_arr(0.83, 0.88, y)
        base *= (1 - 0.35 * floor)[..., None]
        g = np.exp(-(((x - 0.5) / 0.30) ** 2 + ((y - 0.60) / 0.24) ** 2))
        lit += g[..., None] * np.array((0.42, 0.22, 0.07), np.float32)
        refl = np.exp(-(((x - 0.5) / 0.09) ** 2 + ((y - 0.905) / 0.03) ** 2)) * floor
        lit += refl[..., None] * np.array((0.55, 0.32, 0.10), np.float32)
        lit += (base * 2.2) * g[..., None]
        return base, lit

    # ------------------------------------------------------------ products
    def cutout(self, rel, height_px):
        """Load a cutout, trim to its bounds and scale to a target height."""
        im = self.A.rgba(rel)
        a = im[..., 3]
        ys, xs = np.nonzero(a > 0.03)
        im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        f = height_px / im.shape[0]
        interp = cv2.INTER_AREA if f < 1 else cv2.INTER_LANCZOS4
        im = cv2.resize(im, (max(1, int(im.shape[1] * f)), int(height_px)), interpolation=interp)
        im[..., :3] = unsharp(np.clip(im[..., :3], 0, 1), 1.2 * self.s + 0.3, 0.35 if f > 1 else 0.15)
        im[..., 3] = np.clip(im[..., 3], 0, 1)
        return im

    def place(self, img, cut, cx, bottom, warm=(1.04, 1.0, 0.93), rim=0.55, shadow=0.7, light=None, reflect=0.0):
        """Composite a cutout standing on a surface; returns a full-size mask of where it is."""
        h, w = cut.shape[:2]
        x0, y0 = int(cx - w / 2), int(bottom - h)
        rgb = cut[..., :3] * np.array(warm, np.float32)
        a = cut[..., 3]
        if light is not None:
            rgb = rgb * light[..., None]
        k = max(3, int(9 * self.s) | 1)
        edge = np.clip(a - cv2.erode(a, np.ones((k, k), np.uint8)), 0, 1)
        yy = np.linspace(1.0, 0.25, h, dtype=np.float32)[:, None]
        rgb = rgb + cv2.GaussianBlur(edge, (0, 0), 2 * self.s + 0.5)[..., None] * yy[..., None] * GOLD * rim
        if shadow:
            sh = np.zeros(img.shape[:2], np.float32)
            cv2.ellipse(sh, (int(cx), int(bottom - 2 * self.s)), (int(w * 0.46), max(2, int(h * 0.028))), 0, 0, 360, 1.0, -1)
            sh = cv2.GaussianBlur(sh, (0, 0), 10 * self.s + 1)
            img *= (1 - shadow * sh)[..., None]
        if reflect:
            fr = rgb[::-1] * 0.55; fa = a[::-1]
            fade = np.clip(1 - np.linspace(0, 1, h, dtype=np.float32) / 0.35, 0, 1)[:, None] ** 1.5
            over(img, fr, cv2.GaussianBlur(fa * fade * reflect, (0, 0), 2 * self.s + 0.5), x0, int(bottom + 0.02 * self.BH))
        over(img, rgb, a, x0, y0)
        mask = np.zeros(img.shape[:2], np.float32)
        H, W = mask.shape
        cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
        mask[cy0:cy1, cx0:cx1] = a[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
        return mask, (x0, y0, w, h)

    def cover(self, rel, focus=(0.5, 0.5), w=None, h=None, warm=(1.05, 1.0, 0.92), sharpen=0.35):
        """Photo resized to cover the padded frame around a focus point."""
        w = w or self.BW; h = h or self.BH
        im = self.A.rgb(rel)
        ih, iw = im.shape[:2]
        f = max(w / iw, h / ih)
        im = cv2.resize(im, (int(math.ceil(iw * f)), int(math.ceil(ih * f))),
                        interpolation=cv2.INTER_AREA if f < 1 else cv2.INTER_LANCZOS4)
        ih, iw = im.shape[:2]
        x0 = int(np.clip(focus[0] * iw - w / 2, 0, iw - w)); y0 = int(np.clip(focus[1] * ih - h / 2, 0, ih - h))
        im = im[y0:y0 + h, x0:x0 + w]
        im = unsharp(np.clip(im, 0, 1), 1.4 * self.s + 0.4, sharpen) * np.array(warm, np.float32)
        return np.clip(im, 0, 1)

    # ------------------------------------------------------------ light
    def sweep(self, img, mask, pos, strength=0.55, width=0.07, angle=0.5):
        """Soft gold band of light gliding across `mask` (pos runs ~ -0.2 .. 1.2)."""
        H, W = img.shape[:2]
        ys, xs = np.nonzero(mask > 0.02) if mask is not None else (None, None)
        if mask is not None and len(ys) == 0:
            return
        if mask is None:
            y0, y1, x0, x1 = 0, H, 0, W
        else:
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        x, y = self.coords(H, W)
        xx, yy = x[y0:y1, x0:x1], y[y0:y1, x0:x1]
        d = (xx * math.cos(angle) + yy * math.sin(angle) * H / W) / (math.cos(angle) + math.sin(angle) * H / W)
        band = np.exp(-((d - pos) / width) ** 2)
        sub = img[y0:y1, x0:x1]
        lum = sub.mean(2)
        m = mask[y0:y1, x0:x1] if mask is not None else np.clip((lum - 0.25) * 2.0, 0, 1)
        sub += (band * m * (0.25 + 0.9 * lum * (1 - 0.7 * lum)) * strength)[..., None] * GOLD

    def cam(self, img, zoom, fx, fy, dx=0.0, dy=0.0):
        """Virtual camera: show img around focus (fx, fy) (fractions) at zoom >= 1."""
        H, W = self.H, self.W
        ih, iw = img.shape[:2]
        z = zoom * W / (iw / 1.12)
        M = np.float32([[z, 0, W / 2 + dx * W - fx * iw * z], [0, z, H / 2 + dy * H - fy * ih * z]])
        return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

    # ------------------------------------------------------------ fire
    def _flame_sprite(self):
        fw, fh = int(64 * self.s * 2) | 1, int(150 * self.s * 2) | 1
        out = np.zeros((fh, fw, 3), np.float32)
        for scale, col, blur in ((1.0, (1.0, 0.42, 0.06), 0.10), (0.72, (1.0, 0.72, 0.22), 0.08), (0.42, (1.0, 0.96, 0.82), 0.06)):
            m = Image.new("L", (fw * 4, fh * 4), 0); d = ImageDraw.Draw(m)
            W4, H4 = fw * 4, fh * 4
            bw, bh = W4 * 0.46 * scale, H4 * 0.30 * scale
            cx, by = W4 / 2, H4 * 0.97
            d.ellipse([cx - bw, by - 2 * bh, cx + bw, by], fill=255)
            d.polygon([(cx - bw * 0.98, by - bh * 1.05), (cx + bw * 0.98, by - bh * 1.05), (cx, by - H4 * 0.95 * scale)], fill=255)
            a = cv2.resize(np.asarray(m, np.float32) / 255, (fw, fh), interpolation=cv2.INTER_AREA)
            a = cv2.GaussianBlur(a, (0, 0), max(0.8, fw * blur))
            out += a[..., None] * np.array(col, np.float32) * (0.9 if scale == 1.0 else 0.75)
        return out

    def flame(self, img, x, y_base, size, t, seed, k):
        if k <= 0.001:
            return
        sy = (1 + 0.10 * wob(t, seed, 1.4)) * size * (0.35 + 0.65 * k)
        sx = (1 + 0.05 * wob(t, seed + 1, 1.1)) * size * (0.5 + 0.5 * k)
        skew = 0.10 * wob(t, seed + 2, 0.8)
        fb = self.flame_base
        fh, fw = fb.shape[:2]
        ow, oh = int(fw * sx * 1.6) | 1, int(fh * sy * 1.15) | 1
        M = np.float32([[sx, skew * sy, ow / 2 - fw * sx / 2 - skew * sy * fh], [0, sy, oh - fh * sy]])
        spr = cv2.warpAffine(fb, M, (ow, oh), flags=cv2.INTER_LINEAR)
        bright = k * (0.92 + 0.08 * wob(t, seed + 3, 2.3))
        add_patch(img, spr * bright, x, y_base - oh / 2)
        g = gauss_sprite(max(2.0, fw * size * 1.6))
        add_patch(img, g[..., None] * np.array((0.55, 0.26, 0.06), np.float32) * 0.26 * bright, x, y_base - fh * sy * 0.35)

    # ------------------------------------------------------------ particles
    def _init_dust(self):
        r = np.random.default_rng(11)
        n = 170
        self.dust = dict(x=r.uniform(0, 1, n), y=r.uniform(0, 1, n), v=r.uniform(0.006, 0.020, n),
                         sw=r.uniform(0.002, 0.010, n), sf=r.uniform(0.1, 0.4, n), ph=r.uniform(0, 6.28, n),
                         rad=r.uniform(1.2, 4.5, n) * self.s * 2, tw=r.uniform(0.5, 2.0, n))
        self._dsprites = {}

    def dust_draw(self, img, t, amount):
        if amount <= 0.01:
            return
        d = self.dust
        for i in range(len(d["x"])):
            x = (d["x"][i] + d["sw"][i] * math.sin(t * d["sf"][i] * 6.28 + d["ph"][i])) * self.W
            y = ((d["y"][i] - d["v"][i] * t) % 1.0) * self.H
            tw = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * d["tw"][i] * 6.28 + d["ph"][i] * 3))
            rk = round(d["rad"][i] * 2) / 2
            if rk not in self._dsprites:
                self._dsprites[rk] = gauss_sprite(rk)[..., None] * GOLD
            add_patch(img, self._dsprites[rk] * (0.55 * tw * amount), x, y)

    def _init_petals(self):
        r = np.random.default_rng(5)
        self.petals = []
        cols = [((0.55, 0.03, 0.07), (0.86, 0.14, 0.18)), ((0.92, 0.40, 0.04), (1.0, 0.66, 0.14))]
        for i in range(16):
            c0, c1 = cols[i % 2]
            pw, ph = r.uniform(0.020, 0.034) * self.W, 0
            ph = pw * r.uniform(1.3, 1.7)
            spr = self._petal_sprite(int(pw) | 1, int(ph) | 1, c0, c1)
            depth = r.uniform(0.6, 1.4)
            if depth > 1.2:
                spr = cv2.GaussianBlur(spr, (0, 0), 3 * self.s + 0.5)
            self.petals.append(dict(spr=spr, t0=r.uniform(1.4, 6.8), x=r.uniform(0.08, 0.92), v=r.uniform(0.055, 0.10) * depth,
                                    sw=r.uniform(0.01, 0.03), sf=r.uniform(0.15, 0.35), rot=r.uniform(-60, 60), rs=r.uniform(-40, 40)))

    def _petal_sprite(self, w, h, c0, c1):
        m = Image.new("L", (w * 4, h * 4), 0)
        ImageDraw.Draw(m).ellipse([w * 0.4, 0, w * 3.6, h * 4], fill=255)
        a = cv2.resize(np.asarray(m, np.float32) / 255, (w, h), interpolation=cv2.INTER_AREA)
        yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        xx = np.abs(np.linspace(-1, 1, w, dtype=np.float32))[None, :, None]
        col = np.array(c0, np.float32) * (1 - yy) + np.array(c1, np.float32) * yy
        col = col * (1 - 0.45 * xx ** 1.5)                         # darker curled edges
        col = col + 0.10 * np.exp(-(xx / 0.08) ** 2) * (1 - yy)     # soft centre vein
        col = col + 0.18 * np.exp(-(((xx - 0.35) / 0.25) ** 2)) * np.exp(-((yy - 0.3) / 0.2) ** 2)  # sheen
        out = np.dstack([np.clip(np.broadcast_to(col, (h, w, 3)), 0, 1), cv2.GaussianBlur(a, (0, 0), 0.8) * 0.93])
        pad = int(max(w, h) * 0.5)
        return cv2.copyMakeBorder(out, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)

    def petals_draw(self, img, t, amount=1.0):
        for p in self.petals:
            tt = t - p["t0"]
            if tt < 0:
                continue
            y = -0.05 * self.H + p["v"] * tt * self.H
            if y > self.H * 1.05:
                continue
            x = (p["x"] + p["sw"] * math.sin(tt * p["sf"] * 6.28)) * self.W
            spr = p["spr"]; h, w = spr.shape[:2]
            M = cv2.getRotationMatrix2D((w / 2, h / 2), p["rot"] + p["rs"] * tt, 1.0)
            rs = cv2.warpAffine(spr, M, (w, h), flags=cv2.INTER_LINEAR)
            over(img, rs[..., :3] * 0.9, rs[..., 3] * amount, int(x - w / 2), int(y - h / 2))

    # ------------------------------------------------------------ type
    def text(self, key, text, font, size, wght=None, tracking=0.06, color="gold"):
        if key in self._text:
            return self._text[key]
        f = ImageFont.truetype(os.path.join(FONT_DIR, font), int(size))
        if wght:
            try:
                f.set_variation_by_axes([wght])
            except Exception:
                pass
        adv = [f.getlength(ch) for ch in text]
        tw = sum(adv) + tracking * size * (len(text) - 1)
        asc, desc = f.getmetrics()
        pad = int(size * 0.6)
        Wt, Ht = int(tw + 2 * pad), int(asc + desc + 2 * pad)
        m = Image.new("L", (Wt, Ht), 0); d = ImageDraw.Draw(m)
        x = pad
        for ch, a in zip(text, adv):
            d.text((x, pad), ch, font=f, fill=255)
            x += a + tracking * size
        a = np.asarray(m, np.float32) / 255
        ys = np.nonzero(a.max(1) > 0.02)[0]
        g = np.clip((np.arange(Ht, dtype=np.float32) - ys.min()) / max(1, ys.max() - ys.min()), 0, 1)[:, None]
        if color == "gold":
            top, mid, bot = np.array((1.0, 0.93, 0.70)), np.array((0.93, 0.74, 0.36)), np.array((0.72, 0.50, 0.20))
            col = np.where(g[..., None] < 0.45, top + (mid - top) * (g[..., None] / 0.45), mid + (bot - mid) * ((g[..., None] - 0.45) / 0.55))
            col = np.broadcast_to(col, (Ht, Wt, 3)).astype(np.float32)
        else:
            col = np.ones((Ht, Wt, 3), np.float32) * np.array((0.98, 0.94, 0.86), np.float32)
        shadow = cv2.GaussianBlur(a, (0, 0), size * 0.05)
        glow = cv2.GaussianBlur(a, (0, 0), size * 0.22)
        layer = dict(a=a, col=col, sh=shadow, glow=glow, w=Wt, h=Ht)
        self._text[key] = layer
        return layer

    def fit_size(self, text, font, max_w, start, wght=None, tracking=0.06):
        f = ImageFont.truetype(os.path.join(FONT_DIR, font), int(start))
        if wght:
            try:
                f.set_variation_by_axes([wght])
            except Exception:
                pass
        tw = sum(f.getlength(ch) for ch in text) + tracking * start * (len(text) - 1)
        return min(start, start * max_w / tw)

    def put_text(self, img, L, cx, cy, alpha, scale=1.0):
        if alpha <= 0.002:
            return
        a, col, sh, glow = L["a"], L["col"], L["sh"], L["glow"]
        if abs(scale - 1) > 1e-3:
            size = (max(1, int(L["w"] * scale)), max(1, int(L["h"] * scale)))
            a, sh, glow = (cv2.resize(v, size, interpolation=cv2.INTER_LINEAR) for v in (a, sh, glow))
            col = cv2.resize(col, size, interpolation=cv2.INTER_LINEAR)
        h, w = a.shape
        x0, y0 = int(cx - w / 2), int(cy - h / 2)
        dark = np.zeros((h, w, 3), np.float32)
        over(img, dark, sh * 0.65 * alpha, x0, y0 + int(h * 0.02))
        add_patch(img, glow[..., None] * GOLD * 0.22 * alpha, cx, cy)
        over(img, col, a * alpha, x0, y0)

    def ornament(self, img, cx, cy, width, alpha):
        if alpha <= 0.002 or width < 4:
            return
        h = max(3, int(6 * self.s * 2))
        line = np.zeros((h * 6, int(width) + h * 6), np.float32)
        cv2.line(line, (h * 3, h * 3), (int(width) + h * 3, h * 3), 1.0, max(1, int(2.2 * self.s * 2)), cv2.LINE_AA)
        fade = np.clip(1 - np.abs(np.linspace(-1, 1, line.shape[1], dtype=np.float32)) ** 3, 0, 1)[None, :]
        line *= fade
        c = line.shape[1] // 2
        pts = np.array([[c, h * 3 - h * 1.6], [c + h * 1.6, h * 3], [c, h * 3 + h * 1.6], [c - h * 1.6, h * 3]], np.int32)
        cv2.fillConvexPoly(line, pts, 1.0, cv2.LINE_AA)
        col = np.ones(line.shape + (3,), np.float32) * np.array((0.95, 0.78, 0.42), np.float32)
        over(img, col, line * alpha, int(cx - line.shape[1] / 2), int(cy - line.shape[0] / 2))

    # ------------------------------------------------------------ shots
    def lamp_layer(self, height, bottom, cx):
        """The real brass peacock lamp (PCL-05) with a flame-light map and flame points."""
        cut = self.cutout("cut/JSA-PCL-05.png", height)
        h, w = cut.shape[:2]
        yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        xx = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
        bowl = LAMP["bowl_y"]
        lm = 0.34 + 0.62 * np.exp(-((yy - bowl) / 0.20) ** 2) * (1 - 0.25 * xx ** 2) + 0.18 * np.exp(-((yy - 0.15) / 0.12) ** 2)
        flames = [(cx - w / 2 + fx * w, bottom - h + fy * h, fs) for fx, fy, fs in LAMP["flames"]]
        return cut, lm, flames

    def scene_lamp(self, t, kind):
        """Scene 1 (kind='open') and scene 5 (kind='close')."""
        s = self.s
        BW, BH = self.BW, self.BH
        base, lit = self.cached(("temple", kind), lambda: self.temple(3 if kind == "open" else 4))
        if kind == "open":
            L = sstep(0.9, 4.2, t)
            lamp_h, lamp_bottom = 0.54 * BH, 0.865 * BH
        else:
            L = 1.0
            lamp_h, lamp_bottom = 0.40 * BH, 0.915 * BH
        cut, lm, flames = self.cached(("lamp", kind), lambda: self.lamp_layer(lamp_h, lamp_bottom, BW / 2))
        flick = 1 + 0.06 * wob(t, 77, 1.7)
        img = base * (0.10 + 0.90 * L) + lit * (L * flick)
        light = (0.04 + (lm - 0.04) * L * flick) if kind == "open" else lm * flick
        self.place(img, cut, BW / 2, lamp_bottom, warm=(1.02, 0.96, 0.84), rim=0.30 * L, shadow=0.75, light=light)
        for i, (fx, fy, fs) in enumerate(flames):
            k = sstep(0.75 + 0.35 * i, 1.25 + 0.35 * i, t) if kind == "open" else 1.0
            self.flame(img, fx, fy, fs * (lamp_h / (0.54 * BH)), t, 300 + i, k)
        if kind == "open":
            zoom = 1.0 + 0.075 * ease(t / 5.2)
            frame = self.cam(img, zoom, 0.5, 0.56)
        else:
            frame = self.cam(img, 1.035 - 0.035 * ease(t / 6.0), 0.5, 0.52)
        # incense haze drifting up
        hz = self.haze
        off = int((t * 0.018 * hz.shape[0])) % hz.shape[0]
        hz = np.roll(hz, -off, axis=0)
        hz = cv2.resize(hz, (self.W, self.H), interpolation=cv2.INTER_LINEAR)
        frame += (hz * 0.05 * (L if kind == "open" else 0.8))[..., None] * np.array((0.9, 0.8, 0.7), np.float32)
        if kind == "open":
            self.petals_draw(frame, t)
            self.title_open(frame, t)
        else:
            self.title_close(frame, t)
        return frame

    def title_open(self, img, t):
        if t < 4.2:
            return
        W, H, s = self.W, self.H, self.s
        size = self.fit_size(BRAND, "Cinzel-Variable.ttf", 0.84 * W, 160 * s, wght=600, tracking=0.07)
        L = self.text("brand_open", BRAND, "Cinzel-Variable.ttf", size, wght=600, tracking=0.07)
        a = ease((t - 4.4) / 1.0)
        self.put_text(img, L, W / 2, H * (0.205 - 0.006 * a), a, scale=1.035 - 0.035 * a)
        self.ornament(img, W / 2, H * 0.238, 0.42 * W * ease((t - 4.9) / 1.1), a)

    def title_close(self, img, t):
        W, H, s = self.W, self.H, self.s
        lg = self.cached(("logo",), self.logo)
        a = ease((t - 0.6) / 1.0)
        if a > 0:
            sc = 0.94 + 0.06 * a
            lw = int(lg.shape[1] * sc)
            l2 = cv2.resize(lg, (lw, lw), interpolation=cv2.INTER_LINEAR)
            add_patch(img, gauss_sprite(lw * 0.30)[..., None] * GOLD * 0.10 * a, W / 2, H * 0.150)
            over(img, l2[..., :3], l2[..., 3] * a, int(W / 2 - lw / 2), int(H * 0.150 - lw / 2))
        size = self.fit_size(BRAND, "Cinzel-Variable.ttf", 0.84 * W, 160 * s, wght=600, tracking=0.07)
        b = ease((t - 1.4) / 1.0)
        self.put_text(img, self.text("brand_close", BRAND, "Cinzel-Variable.ttf", size, wght=600, tracking=0.07),
                      W / 2, H * (0.288 - 0.004 * b), b)
        self.ornament(img, W / 2, H * 0.318, 0.40 * W * ease((t - 1.9) / 1.0), b)
        tg = ease((t - 2.6) / 1.0)
        tag_size = self.fit_size("Where Faith Meets Art.", "CormorantGaramond-Italic-Variable.ttf", 0.66 * W, 180 * s, wght=500, tracking=0.02)
        self.put_text(img, self.text("tag", "Where Faith Meets Art.", "CormorantGaramond-Italic-Variable.ttf", tag_size, wght=500, tracking=0.02),
                      W / 2, H * 0.352, tg)
        c1 = ease((t - 5.2) / 0.8) * (1 - ease((t - 7.6) / 0.5))
        c2 = ease((t - 8.1) / 0.8)
        cta_size = self.fit_size("Explore Our Sacred Collection Today!", "CormorantGaramond-Variable.ttf", 0.86 * W, 150 * s, wght=600, tracking=0.02)
        self.put_text(img, self.text("cta1", "Explore Our Sacred Collection Today!", "CormorantGaramond-Variable.ttf", cta_size, wght=600, tracking=0.02, color="ivory"),
                      W / 2, H * (0.418 - 0.004 * c1), c1)
        self.put_text(img, self.text("cta2", "Find Your Divine Favourite.", "CormorantGaramond-Variable.ttf", cta_size, wght=600, tracking=0.02, color="ivory"),
                      W / 2, H * (0.418 - 0.004 * c2), c2)

    def logo(self):
        im = self.A.rgba("up/logo.png")
        h, w = im.shape[:2]
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2) / (w / 2)
        im[..., 3] = np.clip((LOGO_R - r) / 0.012, 0, 1)
        size = int(0.30 * self.W)
        return cv2.resize(im, (size, size), interpolation=cv2.INTER_AREA)

    def scene_idol(self, i, t, dur):
        sku, focus_y = IDOLS[i]
        BW, BH = self.BW, self.BH

        def build():
            img = self.alcove(20 + i)
            cut = self.cutout(sku, IDOL_H[i] * BH)
            mask, box = self.place(img, cut, BW / 2, 0.709 * BH, reflect=0.16)
            return img, mask
        still, mask = self.cached(("idol", i), build)
        img = still.copy()
        self.sweep(img, mask, -0.15 + 1.3 * (t / dur), strength=0.55)
        p = ease(t / dur)
        moves = [dict(z=1.0 + 0.06 * p, fx=0.5, fy=focus_y),
                 dict(z=1.05, fx=0.5, fy=focus_y, dx=-0.035 + 0.07 * p),
                 dict(z=1.05, fx=0.5, fy=focus_y, dy=0.035 - 0.05 * p),
                 dict(z=1.0 + 0.06 * p, fx=0.5, fy=focus_y),
                 dict(z=1.05, fx=0.5, fy=focus_y, dx=0.035 - 0.07 * p),
                 dict(z=1.01 + 0.05 * p, fx=0.5, fy=focus_y, dy=0.02 * p)]
        m = moves[i]
        return self.cam(img, m["z"], m["fx"], m["fy"], m.get("dx", 0), m.get("dy", 0))

    def scene_detail(self, i, t, dur):
        rel, focus, zfrom, zto, ang = DETAILS[i]
        still = self.cached(("detail", i), lambda: self.cover(rel, focus, warm=(1.04, 0.99, 0.90)))
        img = still.copy()
        self.sweep(img, None, -0.2 + 1.4 * (t / dur), strength=0.42, width=0.09, angle=ang)
        p = ease(t / dur)
        return self.cam(img, zfrom + (zto - zfrom) * p, 0.5, 0.5)

    def scene_life(self, i, t, dur):
        rel, focus, zfrom, zto, dxs = LIFE[i]
        still = self.cached(("life", i), lambda: self.cover(rel, focus, warm=(1.05, 0.99, 0.90), sharpen=0.25))
        img = still.copy()
        if rel.endswith("trd_diya.png"):
            g = 0.8 + 0.2 * wob(t, 91, 1.6)
            fx, fy = TRD_FLAME
            add_patch(img, gauss_sprite(0.09 * self.BW)[..., None] * np.array((0.55, 0.28, 0.07), np.float32) * 0.55 * g, fx * self.BW, fy * self.BH)
        p = ease(t / dur)
        return self.cam(img, zfrom + (zto - zfrom) * p, 0.5, 0.5, dx=dxs * (p - 0.5))

    # ------------------------------------------------------------ timeline
    def frame(self, t):
        shots = SHOTS
        out = None; wsum = 0.0
        for (a, b, fn, args) in shots:
            xa = XF_SCENE if a in SCENE_CUTS else XF
            xb = XF_SCENE if b in SCENE_CUTS else XF
            lo = a - xa / 2 if a > 0 else 0
            hi = b + xb / 2 if b < DUR else DUR
            if not (lo <= t < hi):
                continue
            w = 1.0
            if a > 0 and t < a + xa / 2:
                w *= ease((t - (a - xa / 2)) / xa)
            if b < DUR and t > b - xb / 2:
                w *= 1 - ease((t - (b - xb / 2)) / xb)
            if w <= 0.001:
                continue
            lt = t - a
            f = getattr(self, fn)(*args, lt, b - a) if fn != "scene_lamp" else self.scene_lamp(lt, *args)
            out = f * w if out is None else out + f * w
            wsum += w
        out = out / max(wsum, 1e-6)
        # golden light-leak at scene changes
        for c in SCENE_CUTS:
            k = math.exp(-((t - c) / 0.22) ** 2)
            if k > 0.01:
                out += self.leak * (0.20 * k)
        # final golden glow
        if t > 48.4:
            k = ease((t - 48.4) / 1.6)
            out += self.endglow * (0.75 * k)
            out += 0.05 * k * GOLD
        dust = 0.0
        if t < 8:
            dust = 0.6 * sstep(1.5, 4.5, t)
        elif t < 18:
            dust = 0.55
        elif t < 28:
            dust = 0.25
        elif t < 39:
            dust = 0.18
        else:
            dust = 0.8
        self.dust_draw(out, t, dust)
        out *= self.vignette
        out = np.clip(out, 0, 1)
        out = out ** 0.97                                     # gentle lift
        g = cv2.resize(np.roll(self.grain, int(t * 977) % self.grain.shape[0], 0), (self.W, self.H), interpolation=cv2.INTER_NEAREST)
        out = np.clip(out + g[..., None], 0, 1)
        return out


def sstep_arr(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- content
# Lamp (cut/JSA-PCL-05.png): flame points as fractions of the cutout box, size factor
LAMP = dict(bowl_y=0.36, flames=[(0.03, 0.346, 0.85), (0.97, 0.350, 0.85), (0.905, 0.295, 0.7), (0.21, 0.460, 1.0), (0.83, 0.460, 1.0)])
LOGO_R = 0.90
IDOLS = [("cut/JSA-RKB-03.png", 0.47), ("cut/JSA-GNS-BRS-01.png", 0.50), ("cut/JSA-SHV-01.png", 0.50),
         ("cut/JSA-LKC-03.png", 0.48), ("cut/JSA-SRW-01.png", 0.49), ("cut/JSA-HNM-075-01.png", 0.50)]
IDOL_H = [0.50, 0.40, 0.44, 0.50, 0.46, 0.43]
DETAILS = [("src/JSA-SHV-06.jpg", (0.5, 0.5), 1.00, 1.08, 0.45),
           ("up/JSA-LKC-05.png", (0.55, 0.5), 1.06, 1.00, 0.9),
           ("up/JSA-RKB-11.png", (0.45, 0.62), 1.00, 1.07, 0.3),
           ("src/JSA-HNM-075-04.jpg", (0.5, 0.45), 1.07, 1.00, 0.6),
           ("up/gns_face.png", (0.5, 0.45), 1.00, 1.08, 0.5),
           ("up/srw_face.png", (0.5, 0.45), 1.06, 1.00, 0.35)]
LIFE = [("up/JSA-RKB-03.png", (0.5, 0.5), 1.00, 1.07, 0.0),
        ("up/JSA-LKC-03-full.png", (0.5, 0.5), 1.04, 1.04, 0.05),
        ("up/JSA-SRW-01.png", (0.55, 0.5), 1.07, 1.00, 0.0),
        ("up/trd_diya.png", (0.5, 0.5), 1.00, 1.06, 0.0)]
TRD_FLAME = (0.447, 0.265)
XF, XF_SCENE = 0.36, 0.7
SCENE_CUTS = (8.0, 18.0, 28.0, 39.0)
SHOTS = [(0.0, 8.0, "scene_lamp", ("open",))]
SHOTS += [(8.0 + i * 10 / 6, 8.0 + (i + 1) * 10 / 6, "scene_idol", (i,)) for i in range(6)]
SHOTS += [(18.0 + i * 10 / 6, 18.0 + (i + 1) * 10 / 6, "scene_detail", (i,)) for i in range(6)]
SHOTS += [(28.0 + i * 2.75, 28.0 + (i + 1) * 2.75, "scene_life", (i,)) for i in range(4)]
SHOTS += [(39.0, 50.0, "scene_lamp", ("close",))]
SHOTS = [(round(a, 4), round(b, 4), f, args) for a, b, f, args in SHOTS]


# ---------------------------------------------------------------- driver
def to8(f):
    return (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)


def worker(args):
    root, scale, a, b, path = args
    film = Film(Assets(root), scale)
    p = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{film.W}x{film.H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                          "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", path], stdin=subprocess.PIPE)
    for n in range(a, b):
        p.stdin.write(to8(film.frame(n / FPS)).tobytes())
        if (n - a) % 60 == 0:
            print(f"[{a}-{b}] frame {n}", flush=True)
    p.stdin.close(); p.wait()
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("assets"); ap.add_argument("out")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--stills", default=None)
    o = ap.parse_args()
    if o.stills:
        os.makedirs(o.out, exist_ok=True)
        film = Film(Assets(o.assets), o.scale)
        for t in [float(v) for v in o.stills.split(",")]:
            cv2.imwrite(os.path.join(o.out, f"t{t:05.2f}.png"), to8(film.frame(t))[..., ::-1])
            print("still", t, flush=True)
        return
    from multiprocessing import Pool
    tmp = o.out + ".parts"; os.makedirs(tmp, exist_ok=True)
    bounds = np.linspace(0, NF, o.workers + 1).astype(int)
    jobs = [(o.assets, o.scale, int(bounds[i]), int(bounds[i + 1]), os.path.join(tmp, f"part{i}.mp4")) for i in range(o.workers)]
    with Pool(o.workers) as pool:
        parts = pool.map(worker, jobs)
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{os.path.abspath(p)}'\n" for p in parts)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", o.out], check=True)
    print("wrote", o.out)


if __name__ == "__main__":
    main()
