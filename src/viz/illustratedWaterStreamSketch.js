import { glassComposition } from "../lib/glassComposition.js";

/**
 * A deliberately illustrated counterpart to the WebGL water scene.
 *
 * This is not a color treatment on the realistic renderer: the water is a
 * flat ink wash, the glass is rebuilt from gently unstable pencil strokes,
 * and droplets are short brush dashes. It uses the same visibility encoding
 * and missing-data rules as the real scene.
 */
const PAPER = "#f7f0ef";
const INK = "#282421";
const PENCIL = "#5a534d";
const WATER = "#5d8fc8";
const WATER_DARK = "#38699f";
const WATER_LIGHT = "#9fc7e5";
const LEAD = "#343434";

function hashSeed(text) {
  return [...String(text)].reduce(
    (sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0,
    17,
  );
}

export function illustratedWaterStreamSketch(p, data) {
  let width = 520;
  let height = 718;
  let droplets = [];
  let leadMarks = [];
  let observer = null;
  let reducedMotion = false;
  let previousTime = 0;

  function size() {
    const available = p._userNode?.clientWidth || 520;
    width = Math.max(260, Math.min(620, available));
    height = Math.max(510, Math.round(width * 1.38));
  }

  function bounds() {
    const glassWidth = Math.min(width * 0.76, 420);
    const left = width / 2 - glassWidth / 2;
    const right = width / 2 + glassWidth / 2;
    const rim = height * 0.43;
    const bottom = height * 0.92;
    const floorInset = glassWidth * 0.11;
    const waterTop = rim + height * 0.055;
    return { left, right, rim, bottom, floorInset, glassWidth, waterTop };
  }

  function halfWidthAt(b, y) {
    const progress = p.constrain((y - b.rim) / (b.bottom - b.rim), 0, 1);
    return b.glassWidth / 2 - b.floorInset * progress;
  }

  function waveY(b, x, t) {
    return (
      b.waterTop +
      Math.sin(x * 0.045 + t * 1.65) * 2.4 +
      Math.sin(x * 0.019 - t * 0.9) * 1.5
    );
  }

  function rebuild() {
    const b = bounds();
    const seed = hashSeed(
      `${data.result?.system?.pwsid}-${data.result?.lead?.value}-drawn`,
    );
    p.randomSeed(seed);

    const streamCount = Math.round(
      Math.min(1700, Math.max(880, (width * height) / 220)),
    );
    droplets = Array.from({ length: streamCount }, (_, index) => ({
      x: p.random(-1, 1),
      y: p.random(0, b.waterTop),
      speed: p.random(0.74, 1.34),
      length: p.random(2.2, 7.5),
      weight: p.random(0.65, 1.45),
      phase: p.random(p.TWO_PI),
      tint:
        index % 7 === 0 ? WATER_LIGHT : index % 3 === 0 ? WATER_DARK : WATER,
    }));

    const composition = glassComposition(data.result, data.hidden || []);
    leadMarks = composition.contaminants.flatMap((item) =>
      Array.from({ length: item.count }, () => ({
        x: p.random(-0.82, 0.82),
        z: p.random(-1, 1),
        age: p.random(0, 44),
        life: p.random(66, 80),
        phase: p.random(p.TWO_PI),
        speed: p.random(0.42, 0.78),
        size: p.random(1.1, 2.25),
        settledX: p.random(-0.82, 0.82),
        tier: item.tier,
      })),
    );
  }

  function pencilLine(x1, y1, x2, y2, seed, t, weight = 1.35) {
    p.noFill();
    p.stroke(INK);
    p.strokeWeight(weight);
    for (let pass = 0; pass < 2; pass += 1) {
      p.beginShape();
      for (let step = 0; step <= 7; step += 1) {
        const k = step / 7;
        const flutter =
          Math.sin(seed * 1.7 + step * 2.2 + pass * 3.1 + t * 0.35) *
          (pass ? 0.55 : 0.85);
        const x = p.lerp(x1, x2, k);
        const y = p.lerp(y1, y2, k);
        p.vertex(x + flutter, y - flutter * 0.45);
      }
      p.endShape();
    }
  }

  function drawPaperTexture(t) {
    p.noStroke();
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 71.3 + 19) % width;
      const y = (i * 43.7 + 31) % height;
      const alpha = 11 + 5 * Math.sin(i + t * 0.08);
      p.fill(74, 62, 52, alpha);
      p.circle(x, y, i % 4 === 0 ? 1.2 : 0.65);
    }
  }

  function drawStream(b, t) {
    const sourceHalf = Math.max(15, width * 0.065);
    for (let index = 0; index < droplets.length; index += 1) {
      const drop = droplets[index];
      const travel = (drop.y + t * 138 * drop.speed) % (b.waterTop + 8);
      const fall = travel / b.waterTop;
      const taper = p.lerp(1, 0.72, fall);
      const x =
        width / 2 +
        drop.x * sourceHalf * taper +
        Math.sin(t * 2.2 + drop.phase) * 1.4;
      const y = travel - 5;
      p.stroke(drop.tint);
      p.strokeWeight(drop.weight);
      p.line(x, y, x + Math.sin(drop.phase) * 0.5, y + drop.length);
    }
  }

  function drawWater(b, t) {
    const insetBottom = b.floorInset;
    p.noStroke();
    p.fill(WATER);
    p.beginShape();
    for (let step = 0; step <= 18; step += 1) {
      const x = p.lerp(b.left + 7, b.right - 7, step / 18);
      p.vertex(x, waveY(b, x, t));
    }
    p.vertex(b.right - insetBottom - 2, b.bottom - 3);
    p.vertex(b.left + insetBottom + 2, b.bottom - 3);
    p.endShape(p.CLOSE);

    // Uneven wash bands and sparse pencil hatching make the body read as an
    // illustration without adding a texture asset or a second renderer.
    p.noStroke();
    p.fill(56, 105, 159, 40);
    for (let band = 0; band < 5; band += 1) {
      const y = p.lerp(b.waterTop + 28, b.bottom - 24, band / 4);
      const half = halfWidthAt(b, y) - 8;
      p.rect(width / 2 - half, y, half * 2, 13 + (band % 2) * 9, 8);
    }

    p.stroke(36, 74, 111, 58);
    p.strokeWeight(0.8);
    for (let row = 0; row < 13; row += 1) {
      const y = b.waterTop + 19 + row * ((b.bottom - b.waterTop - 32) / 13);
      const half = halfWidthAt(b, y) - 12;
      for (let x = width / 2 - half; x < width / 2 + half; x += 27) {
        p.line(x, y + (row % 2) * 2, x + 8, y - 4 + (row % 3));
      }
    }
  }

  function drawLead(b, t, dt) {
    p.stroke(LEAD);
    p.fill(LEAD);
    for (const mark of leadMarks) {
      if (!reducedMotion) mark.age += dt;
      if (mark.age >= mark.life) {
        mark.age = 0;
        mark.x = p.random(-0.82, 0.82);
        mark.phase = p.random(p.TWO_PI);
      }

      const settle = Math.pow(p.constrain(mark.age / 34, 0, 1), 1.6);
      const circulation = 1 - settle;
      const startY = b.waterTop + 13;
      const endY = b.bottom - 7;
      const y =
        p.lerp(startY, endY, settle) +
        Math.sin(t * mark.speed + mark.phase) * (4 + circulation * 14);
      const half = halfWidthAt(b, y) - 11;
      const flow =
        Math.sin(t * mark.speed * 0.72 + mark.phase) *
        half *
        (0.08 + circulation * 0.24);
      const x =
        width / 2 +
        p.lerp(mark.x, mark.settledX, settle) * half +
        flow +
        mark.z * 2;
      const alpha = mark.tier === "illustrative" ? 120 : 205;
      p.stroke(52, 52, 52, alpha);
      p.fill(52, 52, 52, alpha);
      p.strokeWeight(0.75);
      p.circle(x, y, mark.size);
      if (mark.size > 1.8) {
        p.line(x - 1.3, y + 0.8, x + 1.4, y - 0.9);
      }
    }
  }

  function drawGlass(b, t) {
    const inset = b.floorInset;
    pencilLine(b.left, b.rim, b.left + inset, b.bottom, 1, t);
    pencilLine(b.right, b.rim, b.right - inset, b.bottom, 2, t);
    pencilLine(b.left + inset, b.bottom, b.right - inset, b.bottom, 3, t);

    p.noFill();
    p.stroke(PENCIL);
    p.strokeWeight(1.1);
    p.arc(
      width / 2 + Math.sin(t * 0.3) * 0.3,
      b.rim + 2,
      b.glassWidth,
      16,
      0,
      p.PI,
    );

    p.stroke(WATER_DARK);
    p.strokeWeight(1.3);
    p.noFill();
    p.beginShape();
    for (let step = 0; step <= 20; step += 1) {
      const x = p.lerp(b.left + 7, b.right - 7, step / 20);
      p.vertex(x, waveY(b, x, t));
    }
    p.endShape();
  }

  p.setup = () => {
    size();
    p.createCanvas(width, height);
    p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    p.frameRate(30);
    p.textFont("system-ui");
    reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rebuild();
    p.describe(
      "An illustrated stream of blue brush marks falls into a tall hand-drawn glass. Small graphite-gray lead marks circulate in the water before slowly settling.",
    );

    const canvas = p.drawingContext?.canvas;
    if (
      !reducedMotion &&
      canvas &&
      typeof IntersectionObserver === "function"
    ) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) p.loop();
        else p.noLoop();
      });
      observer.observe(canvas);
    }
  };

  p.draw = () => {
    const now = p.millis() / 1000;
    const dt = previousTime ? Math.min(0.05, now - previousTime) : 1 / 30;
    previousTime = now;
    const t = reducedMotion ? 0 : now;
    const b = bounds();
    p.clear();
    p.background(PAPER);
    drawPaperTexture(t);
    drawStream(b, t);
    drawWater(b, t);
    drawLead(b, t, dt);
    drawGlass(b, t);
    if (reducedMotion) p.noLoop();
  };

  p.windowResized = () => {
    size();
    p.resizeCanvas(width, height);
    previousTime = 0;
    rebuild();
  };

  const originalRemove = p.remove?.bind(p);
  p.remove = (...args) => {
    observer?.disconnect();
    observer = null;
    return originalRemove?.(...args);
  };
}
