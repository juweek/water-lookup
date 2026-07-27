import { glassComposition } from "../lib/glassComposition.js";

/**
 * The pour, in WebGL — a RUNNING STREAM of fine droplets falling from a tap
 * into a continuous BODY OF WATER. Droplets stop being droplets the moment
 * they land: the surface absorbs them (ripples + a brief splash), and the
 * standing water is a translucent mesh, not a mound of particles.
 *
 * Rendering, three draw layers back-to-front:
 *   1. water body — a depth-graded front wall + an animated surface sheet
 *      (CPU-displaced vertices: gentle swell + ripple rings radiating from
 *      where the stream lands),
 *   2. falling droplets — three.js Points, sphere-shaded in the fragment
 *      shader (lambert + rim + specular from gl_PointCoord), small and many
 *      so the column reads as water, not beads,
 *   3. contaminant marks — still particles on purpose: lead is denser than
 *      water, so its marks keep sinking THROUGH the body and settle on the
 *      glass floor, visible through the translucent water.
 *
 * Physics: elementary but honest — gravity accelerates the column, the
 * stream narrows as it speeds up (continuity: A·v is constant), impact
 * energy becomes splash droplets and surface ripples, drag in water slows
 * the lead's descent.
 *
 * Honesty rules from AGENTS.md hold: counts are a visibility encoding, a
 * measured zero draws zero contaminant marks, and "not reported" dims the
 * water and keeps its dotted overlay (in the React wrapper).
 *
 * Performance hygiene: typed-array particle store, adaptive budget by canvas
 * area, devicePixelRatio capped at 2, loop paused off-screen via
 * IntersectionObserver, static pre-warmed frame under prefers-reduced-motion,
 * full dispose on unmount. The surface grid is a few hundred vertices — cheap.
 */

// ── World geometry (camera units) ──────────────────────────────────────────
const SPOUT_Y = 9.1; // where the stream enters the frame
const SPOUT_HALF = 1.02; // a broad source makes the pour read as a sheet of water
const RIM_Y = -1.55; // glass rim
const POOL_Y = -2.85; // resting water surface in the glass
const FLOOR_Y = -10.25; // glass floor — deliberately tall, not bowl-shaped
const GLASS_TOP_HALF = 4.5; // glass half-width at rim
const GLASS_BOT_HALF = 3.35; // …and at floor
const GLASS_DEPTH = 1.7; // half-depth (z) of the water body
const GRAVITY = 15;
const CAMERA_FOV = 37;

const WATER_DEEP = [0.09, 0.33, 0.58];
const WATER_LIGHT = [0.5, 0.8, 0.95];

function glassHalfWidth(y) {
  const t = (y - FLOOR_Y) / (RIM_Y - FLOOR_Y);
  return (
    GLASS_BOT_HALF +
    (GLASS_TOP_HALF - GLASS_BOT_HALF) * Math.max(0, Math.min(1, t))
  );
}

// The living waterline. Ripple rings radiate from the impact point (the
// stream lands at x=z=0) over a gentle ambient swell. Shared by the surface
// mesh, the wall's top edge, and the sim (so droplets die exactly at the
// surface they see).
function surfaceY(x, z, t) {
  const r = Math.sqrt(x * x + z * z);
  const ripple = 0.14 * Math.sin(r * 3.1 - t * 6.2) * Math.exp(-r * 0.62);
  const swell =
    0.05 * Math.sin(x * 1.6 + t * 1.2) * Math.sin(z * 2.1 - t * 0.9);
  return POOL_Y + ripple + swell;
}

function hexToVec3(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ── Shaders: point sprites shaded as lit droplets ──────────────────────────
const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uProj;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uProj / -mv.z;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying float vAlpha;
  uniform vec3 uDeep;
  uniform vec3 uLight;
  uniform float uDim;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    // Fake a sphere: reconstruct the normal from the sprite disc.
    float z = sqrt(1.0 - r2);
    vec3 n = vec3(uv.x, -uv.y, z);
    float diff = clamp(dot(n, normalize(vec3(-0.35, 0.75, 0.6))), 0.0, 1.0);
    float rim = pow(1.0 - z, 2.2);
    float spec = pow(diff, 24.0);
    vec3 col = mix(uDeep, uLight, diff * 0.85);
    col += rim * uLight * 0.35 + spec * 0.55;
    float alpha = vAlpha * (0.6 + 0.4 * z) * uDim;
    gl_FragColor = vec4(col, alpha);
  }
`;

// Water body: vertical depth gradient on the wall, crest-lightening on the
// surface. vShade carries "how lit is this vertex" from the CPU/vertex stage.
const BODY_VERT = /* glsl */ `
  attribute float aShade;
  varying float vShade;
  void main() {
    vShade = aShade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BODY_FRAG = /* glsl */ `
  precision mediump float;
  varying float vShade;
  uniform vec3 uDeep;
  uniform vec3 uLight;
  uniform float uAlpha;
  uniform float uDim;
  void main() {
    vec3 col = mix(uDeep, uLight, clamp(vShade, 0.0, 1.0));
    gl_FragColor = vec4(col, uAlpha * uDim);
  }
`;

/**
 * Build the scene inside `container`. Returns a dispose() function.
 * `THREE` is passed in so the module itself stays statically analyzable and
 * three.js loads only through the wrapper's dynamic import.
 */
export function createWaterStream(
  THREE,
  container,
  { result, hidden = [] } = {},
) {
  const composition = glassComposition(result, hidden);
  const measurement = result?.visualMeasurement || result?.lead;
  const unmeasured = measurement?.value == null;
  const dim = unmeasured ? 0.45 : 1;

  let width = Math.max(260, Math.min(620, container.clientWidth || 520));
  let height = Math.max(510, Math.round(width * 1.38));

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.domElement.style.maxWidth = "100%";
  renderer.domElement.style.height = "auto";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    width / height,
    1,
    100,
  );
  camera.position.set(1.5, 0.55, 35);
  camera.lookAt(0, 0.4, 0);

  const uProj = () =>
    (height * pixelRatio * 0.5) /
    Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));

  // ── Particle store (struct-of-arrays) ────────────────────────────────────
  // All water particles live in the falling column or a brief splash — the
  // standing water is a mesh, so the whole budget goes to the stream itself:
  // droplets are SMALL and MANY so the pour reads as water, not beads.
  const waterCount = Math.round(
    Math.min(4400, Math.max(1500, (width * height) / 72)),
  );
  const lead = composition.contaminants[0] || null;
  const leadCount = lead ? lead.count : 0;

  // life[i] semantics: -1 falling · >0 splash droplet (water) or submerged
  // countdown (lead).
  function makeSpecies(count) {
    return {
      count,
      pos: new Float32Array(count * 3),
      vel: new Float32Array(count * 3),
      phase: new Float32Array(count),
      life: new Float32Array(count),
      age: new Float32Array(count),
      target: new Float32Array(count),
      alpha: new Float32Array(count),
      size: new Float32Array(count),
    };
  }

  const water = makeSpecies(waterCount);
  const leadS = makeSpecies(leadCount);

  function spawnAtSpout(s, i, isLead) {
    const j = i * 3;
    s.pos[j] = (Math.random() * 2 - 1) * SPOUT_HALF * 0.92;
    s.pos[j + 1] = SPOUT_Y + Math.random() * 0.8;
    s.pos[j + 2] = (Math.random() * 2 - 1) * 0.4;
    s.vel[j] = 0;
    s.vel[j + 1] = -0.6 - Math.random() * 0.8;
    s.vel[j + 2] = 0;
    s.phase[i] = Math.random() * Math.PI * 2;
    s.life[i] = -1;
    s.age[i] = 0;
    s.alpha[i] = 1;
    s.size[i] = isLead
      ? 0.095 + Math.random() * 0.055
      : 0.09 + Math.random() * 0.09;
  }

  // A landing water droplet is absorbed; a fraction rebounds as splash.
  function absorbWater(s, i, t) {
    const j = i * 3;
    if (Math.random() < 0.22) {
      const impact = Math.min(18, -s.vel[j + 1]);
      s.life[i] = 0.55;
      s.vel[j] = (Math.random() * 2 - 1) * impact * 0.22;
      s.vel[j + 2] = (Math.random() * 2 - 1) * impact * 0.14;
      s.vel[j + 1] = impact * (0.18 + Math.random() * 0.3);
      s.pos[j + 1] = surfaceY(s.pos[j], s.pos[j + 2], t) + 0.05;
    } else {
      spawnAtSpout(s, i, false);
    }
  }

  // A landing lead mark submerges: heavy drag, then a slow settle to the
  // floor, where it lingers — density made visible.
  function submergeLead(s, i) {
    const j = i * 3;
    s.life[i] = 52 + Math.random() * 20;
    s.age[i] = 0;
    s.target[i] = FLOOR_Y + 0.18 + Math.random() * 0.48;
    s.vel[j] = (Math.random() * 2 - 1) * 0.9;
    s.vel[j + 1] *= 0.045;
    s.vel[j + 2] = (Math.random() * 2 - 1) * 0.85;
  }

  function prewarm() {
    // Start mid-pour: the column is already full of droplets at the fall
    // speed matching their height (v = √(2gΔh)).
    for (let i = 0; i < water.count; i++) {
      spawnAtSpout(water, i, false);
      const j = i * 3;
      const y = POOL_Y + Math.random() * (SPOUT_Y - POOL_Y);
      water.pos[j + 1] = y;
      water.vel[j + 1] = -Math.sqrt(2 * GRAVITY * Math.max(0.01, SPOUT_Y - y));
    }
    for (let i = 0; i < leadS.count; i++) {
      spawnAtSpout(leadS, i, true);
      const j = i * 3;
      if (Math.random() < 0.82) {
        // Start at varied ages so the first frame contains both circulating
        // and floor-settled marks rather than one synchronized clump.
        submergeLead(leadS, i);
        leadS.age[i] = Math.random() * 42;
        leadS.life[i] = Math.max(2, leadS.life[i] - leadS.age[i]);
        const settle = Math.pow(Math.min(1, leadS.age[i] / 30), 1.55);
        leadS.pos[j + 1] =
          (POOL_Y - 0.5) * (1 - settle) +
          leadS.target[i] * settle +
          (Math.random() * 2 - 1) * 0.35;
        const half = glassHalfWidth(leadS.pos[j + 1]) - 0.3;
        leadS.pos[j] = (Math.random() * 2 - 1) * half;
        leadS.pos[j + 2] = (Math.random() * 2 - 1) * (GLASS_DEPTH - 0.2);
        leadS.vel[j] = (Math.random() * 2 - 1) * 0.4;
        leadS.vel[j + 1] = 0;
        leadS.vel[j + 2] = (Math.random() * 2 - 1) * 0.35;
      } else {
        const y = POOL_Y + Math.random() * (SPOUT_Y - POOL_Y);
        leadS.pos[j + 1] = y;
        leadS.vel[j + 1] = -Math.sqrt(
          2 * GRAVITY * Math.max(0.01, SPOUT_Y - y),
        );
      }
    }
  }

  function fallStep(s, i, j, dt, t) {
    // Gravity + continuity narrowing + a light wiggle.
    s.vel[j + 1] -= GRAVITY * dt;
    const speed = -s.vel[j + 1];
    const taper = 1 / (1 + speed * 0.045); // faster ⇒ tighter, but still a broad pour
    s.pos[j] -= s.pos[j] * (1 - taper) * dt * 2.25;
    s.pos[j] += Math.sin(t * 7 + s.phase[i]) * 0.016;
    s.pos[j + 2] += Math.cos(t * 6 + s.phase[i]) * 0.011;
    s.pos[j + 1] += s.vel[j + 1] * dt;
  }

  function stepWater(dt, t) {
    const s = water;
    for (let i = 0; i < s.count; i++) {
      const j = i * 3;
      if (s.life[i] < 0) {
        fallStep(s, i, j, dt, t);
        if (s.pos[j + 1] <= surfaceY(s.pos[j], s.pos[j + 2], t))
          absorbWater(s, i, t);
      } else {
        // SPLASH: a short ballistic hop, then the surface takes it.
        s.life[i] -= dt;
        s.vel[j + 1] -= GRAVITY * dt;
        s.pos[j] += s.vel[j] * dt;
        s.pos[j + 1] += s.vel[j + 1] * dt;
        s.pos[j + 2] += s.vel[j + 2] * dt;
        s.alpha[i] = Math.min(1, s.life[i] / 0.3);
        if (
          s.life[i] <= 0 ||
          (s.vel[j + 1] < 0 &&
            s.pos[j + 1] <= surfaceY(s.pos[j], s.pos[j + 2], t))
        ) {
          spawnAtSpout(s, i, false);
        }
      }
    }
  }

  function stepLead(dt, t) {
    const s = leadS;
    for (let i = 0; i < s.count; i++) {
      const j = i * 3;
      if (s.life[i] < 0) {
        fallStep(s, i, j, dt, t);
        if (s.pos[j + 1] <= surfaceY(s.pos[j], s.pos[j + 2], t))
          submergeLead(s, i);
      } else {
        // SUBMERGED: each mark gets an independent circulation phase while
        // density gradually wins and pulls it toward the glass floor.
        s.life[i] -= dt;
        s.age[i] += dt;
        if (s.life[i] <= 0) {
          spawnAtSpout(s, i, true);
          continue;
        }
        // Lead is denser than water, but this is intentionally a long,
        // circulating journey: visible currents dominate at first, then
        // density gradually wins. The eased curve avoids a straight drop.
        const settle = Math.pow(Math.min(1, s.age[i] / 30), 1.55);
        const circulation = 1 - settle;
        const phase = s.phase[i];
        const targetY =
          (POOL_Y - 0.55) * circulation +
          s.target[i] * settle +
          Math.sin(t * (0.62 + (i % 5) * 0.045) + phase) *
            (0.14 + circulation * 0.72);
        const xFlow =
          Math.sin(t * (0.54 + (i % 7) * 0.036) + phase) *
          (0.2 + circulation * 1.22);
        const zFlow =
          Math.cos(t * (0.67 + (i % 6) * 0.04) + phase * 1.3) *
          (0.16 + circulation * 0.88);
        const flowEase = Math.min(1, dt * 1.8);
        s.vel[j] += (xFlow - s.vel[j]) * flowEase;
        s.vel[j + 1] += (targetY - s.pos[j + 1]) * dt * 1.35;
        s.vel[j + 1] *= Math.exp(-dt * 1.25);
        s.vel[j + 2] += (zFlow - s.vel[j + 2]) * flowEase;
        s.pos[j] += s.vel[j] * dt;
        s.pos[j + 1] += s.vel[j + 1] * dt;
        s.pos[j + 2] += s.vel[j + 2] * dt;
        const half = glassHalfWidth(s.pos[j + 1]) - 0.3;
        if (s.pos[j] > half) s.pos[j] = half;
        else if (s.pos[j] < -half) s.pos[j] = -half;
        if (s.pos[j + 2] > GLASS_DEPTH - 0.2) s.pos[j + 2] = GLASS_DEPTH - 0.2;
        else if (s.pos[j + 2] < -GLASS_DEPTH + 0.2)
          s.pos[j + 2] = -GLASS_DEPTH + 0.2;
        s.alpha[i] = Math.min(1, s.life[i] / 0.8);
      }
    }
  }

  // ── Droplet points ───────────────────────────────────────────────────────
  function makePoints(s, deep, light, baseAlpha, renderOrder) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(s.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(s.alpha, 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute("aSize", new THREE.BufferAttribute(s.size, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uProj: { value: uProj() },
        uDeep: { value: new THREE.Vector3(...deep) },
        uLight: { value: new THREE.Vector3(...light) },
        uDim: { value: dim * baseAlpha },
      },
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = renderOrder;
    scene.add(points);
    return { geometry, material, points };
  }

  const waterMesh = makePoints(water, WATER_DEEP, WATER_LIGHT, 0.95, 3);
  let leadMesh = null;
  if (leadCount > 0) {
    const deep = hexToVec3(lead.color).map((c) => c * 0.55);
    const light = hexToVec3(lead.color).map((c) =>
      Math.min(1, c * 1.25 + 0.12),
    );
    // Drawn after the body so settled marks stay readable through the water.
    leadMesh = makePoints(
      leadS,
      deep,
      light,
      lead.tier === "illustrative" ? 0.6 : 1,
      4,
    );
  }

  // ── The body of water: animated surface sheet + depth-graded front wall ──
  const SURF_X = 40; // columns across the surface
  const SURF_Z = 8; // rows front-to-back
  const surfHalf = glassHalfWidth(POOL_Y) - 0.12;

  function makeBodyMaterial(deep, light, alpha) {
    return new THREE.ShaderMaterial({
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uDeep: { value: new THREE.Vector3(...deep) },
        uLight: { value: new THREE.Vector3(...light) },
        uAlpha: { value: alpha },
        uDim: { value: dim },
      },
    });
  }

  // Surface: a subdivided sheet whose vertex heights follow surfaceY() and
  // whose shade lifts on crests, so the ripples read without lighting math.
  const surfGeometry = new THREE.BufferGeometry();
  {
    const verts = new Float32Array((SURF_X + 1) * (SURF_Z + 1) * 3);
    const shade = new Float32Array((SURF_X + 1) * (SURF_Z + 1));
    const index = [];
    for (let iz = 0; iz <= SURF_Z; iz++) {
      for (let ix = 0; ix <= SURF_X; ix++) {
        const k = iz * (SURF_X + 1) + ix;
        verts[k * 3] = (ix / SURF_X) * 2 * surfHalf - surfHalf;
        verts[k * 3 + 1] = POOL_Y;
        verts[k * 3 + 2] = (iz / SURF_Z) * 2 * GLASS_DEPTH - GLASS_DEPTH;
        shade[k] = 0.5;
      }
    }
    for (let iz = 0; iz < SURF_Z; iz++) {
      for (let ix = 0; ix < SURF_X; ix++) {
        const a = iz * (SURF_X + 1) + ix;
        const b = a + 1;
        const c = a + SURF_X + 1;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    surfGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage),
    );
    surfGeometry.setAttribute(
      "aShade",
      new THREE.BufferAttribute(shade, 1).setUsage(THREE.DynamicDrawUsage),
    );
    surfGeometry.setIndex(index);
  }
  const surfMaterial = makeBodyMaterial(
    [0.16, 0.45, 0.68],
    [0.62, 0.88, 1.0],
    0.78,
  );
  const surfMesh = new THREE.Mesh(surfGeometry, surfMaterial);
  surfMesh.renderOrder = 2;
  surfMesh.frustumCulled = false;
  scene.add(surfMesh);

  // Front wall: a column strip per surface column; its top edge follows the
  // surface's front row so body and sheet never split. Shade fades with depth.
  const wallGeometry = new THREE.BufferGeometry();
  {
    const verts = new Float32Array((SURF_X + 1) * 2 * 3);
    const shade = new Float32Array((SURF_X + 1) * 2);
    const index = [];
    const bottomHalf = GLASS_BOT_HALF - 0.12;
    for (let ix = 0; ix <= SURF_X; ix++) {
      const u = ix / SURF_X;
      // top row (follows surface front edge)
      verts[ix * 3] = u * 2 * surfHalf - surfHalf;
      verts[ix * 3 + 1] = POOL_Y;
      verts[ix * 3 + 2] = GLASS_DEPTH;
      shade[ix] = 0.62;
      // bottom row (glass floor, tapered)
      const kb = SURF_X + 1 + ix;
      verts[kb * 3] = u * 2 * bottomHalf - bottomHalf;
      verts[kb * 3 + 1] = FLOOR_Y;
      verts[kb * 3 + 2] = GLASS_DEPTH * 0.6;
      shade[kb] = 0.06;
    }
    for (let ix = 0; ix < SURF_X; ix++) {
      const a = ix;
      const b = ix + 1;
      const c = SURF_X + 1 + ix;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    wallGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(verts, 3).setUsage(THREE.DynamicDrawUsage),
    );
    wallGeometry.setAttribute("aShade", new THREE.BufferAttribute(shade, 1));
    wallGeometry.setIndex(index);
  }
  const wallMaterial = makeBodyMaterial(
    [0.05, 0.19, 0.36],
    [0.2, 0.52, 0.76],
    0.62,
  );
  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
  wallMesh.renderOrder = 1;
  wallMesh.frustumCulled = false;
  scene.add(wallMesh);

  function updateBody(t) {
    const sp = surfGeometry.attributes.position.array;
    const ss = surfGeometry.attributes.aShade.array;
    for (let iz = 0; iz <= SURF_Z; iz++) {
      for (let ix = 0; ix <= SURF_X; ix++) {
        const k = iz * (SURF_X + 1) + ix;
        const y = surfaceY(sp[k * 3], sp[k * 3 + 2], t);
        sp[k * 3 + 1] = y;
        ss[k] = 0.5 + (y - POOL_Y) * 2.6; // crests brighten, troughs deepen
      }
    }
    surfGeometry.attributes.position.needsUpdate = true;
    surfGeometry.attributes.aShade.needsUpdate = true;

    const wp = wallGeometry.attributes.position.array;
    for (let ix = 0; ix <= SURF_X; ix++) {
      wp[ix * 3 + 1] = surfaceY(wp[ix * 3], GLASS_DEPTH, t);
    }
    wallGeometry.attributes.position.needsUpdate = true;
  }

  // ── Glass line art ───────────────────────────────────────────────────────
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xeef6fd,
    transparent: true,
    opacity: 0.65,
  });
  function line(pointsXY) {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      pointsXY.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    );
    const l = new THREE.Line(geometry, lineMaterial);
    scene.add(l);
    return geometry;
  }
  const artGeometries = [
    // The stream begins beyond the crop; only the tapered tumbler is drawn.
    line([
      [-GLASS_TOP_HALF, RIM_Y],
      [-GLASS_BOT_HALF, FLOOR_Y],
      [GLASS_BOT_HALF, FLOOR_Y],
      [GLASS_TOP_HALF, RIM_Y],
    ]),
  ];

  // ── Sizing: track the container so late layout / window resizes both land ─
  function applySize() {
    const w = Math.max(260, Math.min(620, container.clientWidth || 520));
    const h = Math.max(510, Math.round(w * 1.38));
    if (w === width && h === height) return false;
    width = w;
    height = h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const projected = uProj();
    waterMesh.material.uniforms.uProj.value = projected;
    if (leadMesh) leadMesh.material.uniforms.uProj.value = projected;
    return true;
  }

  // ── Loop, visibility, reduced motion, teardown ───────────────────────────
  prewarm();
  updateBody(0);
  // One synchronous frame so the first paint is never blank — the animation
  // loop only takes over once the browser actually grants animation frames.
  renderer.render(scene, camera);

  let elapsed = 0;
  let lastFrame = performance.now();
  let raf = 0;
  let running = false;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    elapsed += dt;
    stepWater(dt, elapsed);
    waterMesh.geometry.attributes.position.needsUpdate = true;
    waterMesh.geometry.attributes.aAlpha.needsUpdate = true;
    if (leadMesh) {
      stepLead(dt, elapsed);
      leadMesh.geometry.attributes.position.needsUpdate = true;
      leadMesh.geometry.attributes.aAlpha.needsUpdate = true;
    }
    updateBody(elapsed);
    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          if (applySize() && !running) renderer.render(scene, camera);
        })
      : null;
  resizeObserver?.observe(container);

  let observer = null;
  if (reducedMotion) {
    // Advance the sim to a natural mid-pour moment, render one still frame.
    for (let k = 0; k < 90; k++) {
      stepWater(1 / 60, k / 60);
      if (leadCount > 0) stepLead(1 / 60, k / 60);
    }
    updateBody(1.5);
    renderer.render(scene, camera);
  } else {
    observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        lastFrame = performance.now(); // swallow the pause so dt doesn't jump
        raf = requestAnimationFrame(frame);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    observer.observe(renderer.domElement);
  }

  return function dispose() {
    running = false;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    resizeObserver?.disconnect();
    waterMesh.geometry.dispose();
    waterMesh.material.dispose();
    leadMesh?.geometry.dispose();
    leadMesh?.material.dispose();
    surfGeometry.dispose();
    surfMaterial.dispose();
    wallGeometry.dispose();
    wallMaterial.dispose();
    for (const g of artGeometries) g.dispose();
    lineMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
