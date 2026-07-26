import { glassComposition, thresholdReading } from '../lib/glassComposition.js';

/**
 * The glass, rendered as WATER MADE OF PARTICLES — a dense luminous particle
 * body fills the liquid region, with contaminant marks swimming inside it,
 * instead of an outlined empty glass holding a handful of dots.
 *
 * Performance notes (this must still run in a few years, on mid phones):
 * - Particle state lives in flat Float32Arrays (struct-of-arrays), no
 *   per-particle objects to allocate or GC.
 * - Particles are PRE-RENDERED radial-gradient sprites blitted with
 *   drawImage(); per-frame arc()+fill() paths are ~4–6× slower at this count.
 * - The water body composites with 'lighter' so overlapping sprites read as
 *   depth/glow for free — no second pass.
 * - The particle budget adapts to canvas area (phones get fewer), the motion
 *   is cheap closed-form trig (no noise() calls), and the loop pauses when
 *   the canvas scrolls off screen and renders a single static frame under
 *   prefers-reduced-motion.
 *
 * Honesty rules still hold: counts are a visibility encoding, a measured zero
 * draws zero contaminant marks, and "not reported" keeps its dotted device —
 * the water field is visual context, never evidence of cleanliness.
 */

// Palette — mirrors the deep-water tokens in src/index.css.
const INK = '#eef6fd';
const MUTED = '#87a2c0';
const PENCIL = '#5f7d9e';
const ACCENT = '#e3b264'; // threshold line: warm, so it reads over blue water
const LEAD_FALLBACK = '#d56f5b';

// Water sprite tints, deep → light. Additive blending mixes them into the body.
const WATER_TINTS = [
  [40, 108, 170],
  [62, 148, 208],
  [110, 198, 238],
];

function hashSeed(text) {
  return [...String(text)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
}

/** Pre-render one soft glowing circle to its own tiny canvas. */
function makeSprite(radius, [r, g, b], alpha) {
  const size = Math.ceil(radius * 2);
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  gradient.addColorStop(0.55, `rgba(${r},${g},${b},${alpha * 0.45})`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function waterParticleSketch(p, data) {
  let width = 520;
  let height = 520;

  // Water body — struct-of-arrays.
  let waterCount = 0;
  let wx, wy, wPhase, wSpeed, wSprite;
  let waterSprites = [];

  // Contaminant marks — few enough for objects, drawn solid (not additive).
  let leadMarks = [];
  let leadSprites = new Map();

  let reducedMotion = false;
  let observer = null;

  function size() {
    const available = p._userNode?.clientWidth || 520;
    width = Math.max(260, Math.min(620, available));
    height = data.compact
      ? Math.max(230, Math.round(width * 0.54))
      : Math.max(380, Math.round(width * 0.92));
  }

  function glassBounds() {
    const compact = !!data.compact;
    const glassWidth = compact ? Math.min(width * 0.46, 220) : Math.min(width * 0.64, 330);
    const glassHeight = compact ? height * 0.7 : height * 0.72;
    return {
      left: width / 2 - glassWidth / 2,
      right: width / 2 + glassWidth / 2,
      top: compact ? 44 : height * 0.13,
      bottom: compact ? 44 + glassHeight : height * 0.13 + glassHeight,
      glassWidth,
      glassHeight,
    };
  }

  // The tumbler tapers 18px inward toward the base; keep particles inside it.
  function wallInset(b, y) {
    return 18 * ((y - b.top) / (b.glassHeight || 1));
  }

  function rebuild() {
    const composition = glassComposition(data.result, data.hidden || []);
    const b = glassBounds();
    p.randomSeed(
      hashSeed(`${data.result?.system?.pwsid}-${data.result?.lead?.value}-${data.mode}`),
    );

    const waterTop = b.top + 26; // below the meniscus line
    const waterArea = b.glassWidth * (b.bottom - waterTop);
    // ~1 particle per 55px² of liquid, clamped so phones stay smooth and
    // desktops stay dense. This is the water ITSELF, not a sparse field.
    waterCount = Math.round(
      Math.min(3200, Math.max(500, waterArea / (data.compact ? 80 : 55))),
    );

    wx = new Float32Array(waterCount);
    wy = new Float32Array(waterCount);
    wPhase = new Float32Array(waterCount);
    wSpeed = new Float32Array(waterCount);
    wSprite = new Uint8Array(waterCount);
    for (let i = 0; i < waterCount; i++) {
      const y = p.random(waterTop, b.bottom - 4);
      const inset = wallInset(b, y);
      wx[i] = p.random(b.left + inset + 4, b.right - inset - 4);
      wy[i] = y;
      wPhase[i] = p.random(p.TWO_PI);
      wSpeed[i] = p.random(0.5, 1.4);
      // Deeper particles skew to deeper tints; a light band near the surface.
      const depth = (y - waterTop) / (b.bottom - waterTop);
      wSprite[i] = Math.min(
        waterSpriteVariants - 1,
        Math.floor(p.random(0, waterSpriteVariants) * (1.15 - depth * 0.45)),
      );
    }

    leadMarks = composition.contaminants.flatMap((item) =>
      Array.from({ length: item.count }, () => ({
        x: p.random(b.left + 20, b.right - 20),
        y: p.random(waterTop + 6, b.bottom - 10),
        size: p.random(2.6, 5.4),
        speed: p.random(0.25, 0.7),
        phase: p.random(p.TWO_PI),
        color: item.color,
        tier: item.tier,
      })),
    );
  }

  // Sprite atlas: 3 tints × 3 radii for water, plus per-color lead sprites.
  const waterSpriteVariants = 9;
  function buildSprites() {
    waterSprites = [];
    for (const tint of WATER_TINTS) {
      for (const radius of [2.2, 3.4, 5]) {
        waterSprites.push(makeSprite(radius, tint, 0.5));
      }
    }
    leadSprites = new Map();
  }

  function leadSprite(color, tier) {
    const key = `${color}-${tier}`;
    if (!leadSprites.has(key)) {
      leadSprites.set(
        key,
        makeSprite(5.5, hexToRgb(color), tier === 'illustrative' ? 0.6 : 0.95),
      );
    }
    return leadSprites.get(key);
  }

  function drawWaterBody(b, t) {
    const ctx = p.drawingContext;
    const waterTop = b.top + 26;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dim = data.result?.lead?.value == null ? 0.45 : 1; // unreported: dimmer field
    ctx.globalAlpha = dim;
    for (let i = 0; i < waterCount; i++) {
      // Cheap curl-ish drift: two out-of-phase waves, time-scaled, no noise().
      const drift = Math.sin(wy[i] * 0.021 + t * 0.7 * wSpeed[i] + wPhase[i]) * 0.42;
      const rise = Math.cos(wx[i] * 0.017 + t * 0.5 * wSpeed[i] + wPhase[i]) * 0.3 - 0.05;
      let x = wx[i] + drift;
      let y = wy[i] + rise;
      // Recirculate within the tapered liquid region.
      if (y < waterTop) y = b.bottom - 5;
      else if (y > b.bottom - 3) y = waterTop + 2;
      const inset = wallInset(b, y) + 4;
      if (x < b.left + inset) x = b.right - inset - 2;
      else if (x > b.right - inset) x = b.left + inset + 2;
      wx[i] = x;
      wy[i] = y;
      const sprite = waterSprites[wSprite[i]];
      ctx.drawImage(sprite, x - sprite.width / 2, y - sprite.height / 2);
    }
    ctx.restore();
  }

  function drawSurface(b, t) {
    // Meniscus: a bright waterline that shimmers slightly.
    const waterTop = b.top + 26;
    p.noFill();
    p.stroke(150, 214, 244, 190);
    p.strokeWeight(1.5);
    const wobble = reducedMotion ? 0 : Math.sin(t * 1.1) * 1.2;
    p.line(b.left + 7, waterTop + wobble, b.right - 7, waterTop + wobble);
  }

  function drawLeadMarks(b, t) {
    const ctx = p.drawingContext;
    const waterTop = b.top + 26;
    for (const mark of leadMarks) {
      const x = mark.x + Math.sin(t * mark.speed + mark.phase) * 3;
      let y = mark.y + Math.sin(t * mark.speed * 0.6 + mark.phase) * 1.6 + 0.0;
      if (y > b.bottom - 8) y = b.bottom - 8;
      if (y < waterTop + 4) y = waterTop + 4;
      const sprite = leadSprite(mark.color, mark.tier);
      const scale = mark.size / 5.5;
      const drawSize = sprite.width * scale;
      ctx.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
    }
  }

  function drawGlass(b) {
    // Drawn AFTER the water so the rim reads as glass in front of liquid.
    p.noFill();
    p.stroke(238, 246, 253, 175);
    p.strokeWeight(2);
    p.line(b.left, b.top, b.left + 18, b.bottom);
    p.line(b.right, b.top, b.right - 18, b.bottom);
    p.line(b.left + 18, b.bottom, b.right - 18, b.bottom);
    p.arc(width / 2, b.top + 2, b.glassWidth, 18, 0, p.PI);
  }

  function drawUnmeasured(b) {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.setLineDash([5, 7]);
    p.noFill();
    p.stroke(PENCIL);
    p.strokeWeight(1.5);
    p.rect(b.left + 28, b.top + 48, b.glassWidth - 56, b.glassHeight - 82, 24);
    ctx.restore();

    p.noStroke();
    p.fill(MUTED);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(data.compact ? 11 : 13);
    p.text('LEAD RESULT NOT REPORTED', width / 2, b.top + b.glassHeight / 2);
  }

  function drawThreshold(b) {
    const reading = thresholdReading(data.result?.lead, data.mode);
    const leadValue = Number(data.result?.lead?.value ?? 0);
    const legal = data.result?.lead?.definition?.legal ?? 15;
    const max = Math.max(legal * 1.25, leadValue * 1.15, 1);
    const readingY = p.map(Math.min(leadValue, max), 0, max, b.bottom, b.top + 22);
    const thresholdValue = data.mode === 'health' ? 0 : legal;
    const thresholdY = p.map(Math.min(thresholdValue, max), 0, max, b.bottom, b.top + 22);

    p.stroke(ACCENT);
    p.strokeWeight(2);
    p.line(b.left - 8, thresholdY, b.right + 8, thresholdY);
    p.noStroke();
    p.fill(ACCENT);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.textSize(11);
    p.text(
      data.mode === 'health' ? 'EPA health goal · 0' : `Federal action · ${legal} µg/L`,
      b.left,
      thresholdY - 6,
    );

    if (data.result?.lead?.value != null) {
      p.stroke(data.result.lead.definition?.color || LEAD_FALLBACK);
      p.strokeWeight(3);
      p.line(b.left - 4, readingY, b.right + 4, readingY);
      p.noStroke();
      p.fill(INK);
      p.textAlign(p.RIGHT, p.TOP);
      p.textSize(11);
      p.text(`reported · ${leadValue} µg/L`, b.right, readingY + 6);
    }

    p.noStroke();
    p.fill(reading.over ? LEAD_FALLBACK : MUTED);
    p.textAlign(p.CENTER, p.BOTTOM);
    p.textSize(12);
    p.text(reading.label, width / 2, height - 6);
  }

  p.setup = () => {
    size();
    p.createCanvas(width, height);
    // Cap density at 2: retina crispness without 3×-pixel phone canvases.
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    p.textFont('system-ui');
    buildSprites();
    rebuild();

    reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Don't burn frames while the canvas is scrolled off screen.
    const canvasElt = p.drawingContext?.canvas;
    if (!reducedMotion && canvasElt && typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) p.loop();
        else p.noLoop();
      });
      observer.observe(canvasElt);
    }
  };

  p.draw = () => {
    p.clear();
    const t = p.millis() / 1000;
    const b = glassBounds();
    drawWaterBody(b, reducedMotion ? 0 : t);
    drawSurface(b, reducedMotion ? 0 : t);
    if (data.result?.lead?.value == null) drawUnmeasured(b);
    else drawLeadMarks(b, reducedMotion ? 0 : t);
    drawGlass(b);
    if (data.mode === 'legal' || data.mode === 'health') drawThreshold(b);
    if (reducedMotion) p.noLoop(); // one composed static frame
  };

  p.windowResized = () => {
    size();
    p.resizeCanvas(width, height);
    rebuild();
  };

  const originalRemove = p.remove?.bind(p);
  p.remove = (...args) => {
    observer?.disconnect();
    observer = null;
    return originalRemove?.(...args);
  };
}
