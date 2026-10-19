/*
 * Pocket Parrot 3D view, rendered with Three.js (vendor/three.min.js).
 *
 * The bird is a stand-in built from simple shapes, but it is put together
 * like a rigged model: every moving part hangs off a named pivot (body,
 * neck, head, wings, tail, beak, jaw, eyes, feet), the way a real model's
 * bones do. Animations only move those pivots, so a proper model can replace
 * the stand-in later and keep the same animation names.
 *
 * mount() returns null when WebGL or Three.js is unavailable, and the game
 * falls back to the 2D artwork.
 */
(function (root) {
  'use strict';

  const THREE = root.THREE;
  const HEX = /^#[0-9a-f]{6}$/i;
  const TAU = Math.PI * 2;
  const BASE_YAW = 0.55;   // three-quarter view, facing right
  const FEET = '#9A8C86';

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const bump = (p) => Math.sin(Math.PI * clamp01(p));
  const ease = (p) => { p = clamp01(p); return p * p * (3 - 2 * p); };
  const pulse = (p, n) => Math.abs(Math.sin(Math.PI * n * p));
  const mix = (a, b, t) => root.ParrotArt.mix(a, b, t);

  if (THREE && THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) {
      return false;
    }
  }

  // ---- Shared resources --------------------------------------------------

  let shared = null;

  // Overlapping feather scallops, used as both a color map and a bump map.
  function featherTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    const cols = 8;
    const rows = 10;
    const w = size / cols;
    const h = size / rows;
    for (let r = rows + 1; r >= -1; r -= 1) {   // lower rows first so upper feathers overlap them
      for (let col = -1; col <= cols; col += 1) {
        const x = col * w + (r % 2 ? w / 2 : 0);
        const y = r * h;
        const grad = g.createLinearGradient(x, y - h, x, y + h);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.8, '#f8f8f8');
        grad.addColorStop(1, '#e2e2e2');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(x, y, w * 0.62, h * 1.05, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.05)';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(x, y, w * 0.62, h * 1.05, 0, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1.5);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  // A cone bent downward at the tip: a hooked parrot beak.
  function beakGeometry() {
    const geo = new THREE.ConeGeometry(0.15, 0.4, 24, 10);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, 0.2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const t = pos.getZ(i) / 0.4;
      pos.setX(i, pos.getX(i) * (0.78 - 0.25 * t));
      pos.setY(i, pos.getY(i) - 0.3 * t * t);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function tailGeometry() {
    const geo = new THREE.ConeGeometry(0.17, 1.15, 16, 4);
    geo.rotateX(Math.PI);           // tip down
    geo.translate(0, -0.575, 0);    // base at the pivot
    return geo;
  }

  function getShared() {
    if (shared) return shared;
    const crest = new THREE.ConeGeometry(1, 1, 10);
    crest.translate(0, 0.5, 0);
    shared = {
      sphere: new THREE.SphereGeometry(1, 32, 24),
      beak: beakGeometry(),
      tail: tailGeometry(),
      crest,
      cone: new THREE.ConeGeometry(1, 1, 20),
      feathers: featherTexture(),
    };
    return shared;
  }

  // ---- Building the stand-in bird ---------------------------------------

  function build(bird, wearing) {
    const S = getShared();
    const c = bird.colors || {};
    const pick = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
    const headHex = pick(c.head, '#D7262E');
    const bodyHex = pick(c.body, headHex);
    const wingHex = pick(c.wing, bodyHex);
    const beakHex = pick(c.beak, '#E8D9B5');
    const mats = [];

    const feather = (hex) => {
      const m = new THREE.MeshStandardMaterial({ color: hex, map: S.feathers, bumpMap: S.feathers, bumpScale: 0.12, roughness: 0.85 });
      mats.push(m);
      return m;
    };
    const plain = (hex, roughness, metalness) => {
      const m = new THREE.MeshStandardMaterial({ color: hex, roughness: roughness == null ? 0.6 : roughness, metalness: metalness || 0 });
      mats.push(m);
      return m;
    };
    const group = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const blob = (mat, sx, sy, sz, x, y, z, parent) => {
      const m = new THREE.Mesh(S.sphere, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const cone = (mat, r, h, x, y, z, parent) => {
      const m = new THREE.Mesh(S.cone, mat);
      m.scale.set(r, h, r);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };

    const rig = { mats, eyes: [], feet: [] };
    rig.root = new THREE.Group();
    rig.body = group(rig.root, 0, 0, 0);   // pivot at the feet: hops, spins, dances

    const bodyMat = feather(bodyHex);
    blob(bodyMat, 0.42, 0.62, 0.4, 0, 0.66, -0.02, rig.body).rotation.x = 0.22;
    blob(feather(mix(bodyHex, '#FFFFFF', 0.22)), 0.33, 0.5, 0.28, 0, 0.6, 0.14, rig.body).rotation.x = 0.22;

    rig.tail = group(rig.body, 0, 0.3, -0.2);
    rig.tail.rotation.x = 0.38;
    const tail = new THREE.Mesh(S.tail, feather(pick(c.tail, bodyHex)));
    tail.scale.set(1, 1, 0.35);
    rig.tail.add(tail);

    const wingMat = feather(wingHex);
    const tipMat = feather(pick(c.wingTip, wingHex));
    for (const side of [-1, 1]) {
      const wing = group(rig.body, 0.36 * side, 1.0, -0.02);
      blob(wingMat, 0.1, 0.56, 0.3, 0.03 * side, -0.42, -0.06, wing).rotation.x = 0.28;
      blob(tipMat, 0.075, 0.36, 0.17, 0.03 * side, -0.92, -0.2, wing).rotation.x = 0.4;
      rig[side < 0 ? 'wingL' : 'wingR'] = wing;
    }

    const feetMat = plain(FEET, 0.8);
    for (const side of [-1, 1]) {
      const foot = group(rig.body, 0.14 * side, 0, 0.1);
      blob(feetMat, 0.07, 0.05, 0.1, 0, 0.03, 0.02, foot);
      blob(feetMat, 0.03, 0.08, 0.03, 0.035, -0.05, 0.1, foot);
      blob(feetMat, 0.03, 0.08, 0.03, -0.035, -0.05, 0.1, foot);
      rig.feet.push(foot);
    }

    rig.neck = group(rig.body, 0, 1.18, 0.1);
    rig.head = group(rig.neck, 0, 0, 0);    // idle look-around layer
    blob(feather(headHex), 0.34, 0.33, 0.35, 0, 0.24, 0.06, rig.head);
    if (bird.facePatch) {
      const face = plain('#F6F4EF', 0.75);
      for (const side of [-1, 1]) blob(face, 0.07, 0.12, 0.13, 0.25 * side, 0.22, 0.2, rig.head);
    }
    if (c.cheek && HEX.test(c.cheek)) {
      const cheek = plain(c.cheek, 0.8);
      for (const side of [-1, 1]) blob(cheek, 0.06, 0.08, 0.1, 0.28 * side, 0.12, 0.18, rig.head);
    }
    const iris = plain('#EFE6CF', 0.3);
    const pupil = plain('#121212', 0.15);
    for (const side of [-1, 1]) {
      const eye = group(rig.head, 0.27 * side, 0.31, 0.15);
      blob(iris, 0.058, 0.058, 0.058, 0, 0, 0, eye);
      blob(pupil, 0.042, 0.042, 0.042, 0.026 * side, 0.004, 0.026, eye);
      rig.eyes.push(eye);
    }

    rig.beak = group(rig.head, 0, 0.17, 0.33);
    rig.beak.add(new THREE.Mesh(S.beak, plain(beakHex, 0.35)));
    rig.jaw = group(rig.beak, 0, -0.05, 0);
    blob(plain(mix(beakHex, '#000000', 0.3), 0.4), 0.1, 0.07, 0.13, 0, -0.03, 0.08, rig.jaw);

    if (bird.crest === 'tall' || bird.crest === 'tuft') {
      const tall = bird.crest === 'tall';
      const n = tall ? 5 : 3;
      const crestMat = feather(pick(c.crest, headHex));
      const crest = group(rig.head, 0, 0.5, 0.02);
      for (let i = 0; i < n; i += 1) {
        const spread = i - (n - 1) / 2;
        const f = new THREE.Mesh(S.crest, crestMat);
        f.scale.set(0.055, (tall ? 0.55 : 0.28) * (1 - Math.abs(spread) * 0.12), 0.03);
        f.position.set(0, 0, 0.08 - i * 0.07);
        f.rotation.set(-0.3 - i * (tall ? 0.14 : 0.2), 0, spread * 0.12);
        crest.add(f);
      }
    }

    addAccessories(rig, wearing || {}, { plain, group, blob, cone });
    rig.pivots = [rig.root, rig.body, rig.tail, rig.wingL, rig.wingR, rig.neck, rig.head, rig.beak, rig.jaw, ...rig.eyes, ...rig.feet];
    rig.rest = rig.pivots.map((o) => [o.position.clone(), o.rotation.clone(), o.scale.clone()]);
    return rig;
  }

  function addAccessories(rig, wearing, h) {
    const gold = () => h.plain('#F2B829', 0.3, 0.8);
    if (wearing.head === 'crown') {
      const g = h.group(rig.head, 0, 0.52, 0.04);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 24, 1, true), gold());
      band.material.side = THREE.DoubleSide;
      g.add(band);
      const spike = gold();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        h.cone(spike, 0.04, 0.12, Math.sin(a) * 0.18, 0.11, Math.cos(a) * 0.18, g);
      }
      h.blob(h.plain('#D7262E', 0.2), 0.035, 0.035, 0.02, 0, 0, 0.19, g);
    } else if (wearing.head === 'partyhat') {
      const g = h.group(rig.head, 0, 0.62, 0);
      g.rotation.set(-0.25, 0, 0.2);
      h.cone(h.plain('#F6C945', 0.6), 0.17, 0.42, 0, 0, 0, g);
      h.blob(h.plain('#D7262E', 0.7), 0.06, 0.06, 0.06, 0, 0.22, 0, g);
    } else if (wearing.head === 'hibiscus') {
      const g = h.group(rig.head, -0.26, 0.44, -0.06);
      const petal = h.plain('#EE4F7C', 0.6);
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        h.blob(petal, 0.03, 0.06, 0.045, -0.01, Math.sin(a) * 0.06, Math.cos(a) * 0.06, g).rotation.x = -a;
      }
      h.blob(h.plain('#F6C945', 0.5), 0.025, 0.025, 0.025, -0.03, 0, 0, g);
    }
    if (wearing.face === 'shades') {
      const g = h.group(rig.head, 0, 0.31, 0.15);
      const lens = h.plain('#16181B', 0.1, 0.3);
      for (const side of [-1, 1]) h.blob(lens, 0.04, 0.085, 0.11, 0.33 * side, 0, 0.02, g);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), lens);
      bridge.position.set(0, 0.06, 0.2);
      g.add(bridge);
    }
    if (wearing.neck === 'bowtie') {
      const g = h.group(rig.body, 0, 1.08, 0.37);
      const cloth = h.plain('#23262B', 0.7);
      for (const side of [-1, 1]) h.cone(cloth, 0.07, 0.16, 0.08 * side, 0, 0, g).rotation.z = (Math.PI / 2) * side;
      h.blob(h.plain('#3B3F45', 0.7), 0.035, 0.035, 0.035, 0, 0, 0.01, g);
    }
  }

  // ---- Animation ------------------------------------------------------------

  function flap(r, a) {
    r.wingL.rotation.z -= a;
    r.wingR.rotation.z += a;
  }

  // Each animation offsets the rest pose; p runs from 0 to 1.
  const ANIMS = {
    eat:      { dur: 1.3,  run(r, p) { const k = pulse(p, 3); r.neck.rotation.x += 0.7 * k; r.neck.position.z += 0.06 * k; r.jaw.rotation.x += 0.25 * k; } },
    hop:      { dur: 0.95, run(r, p) { const k = pulse(p, 2); r.body.position.y += 0.45 * k; flap(r, 0.7 * k); } },
    flap:     { dur: 1.15, run(r, p) { const b = bump(p); r.body.position.y += 0.18 * b; flap(r, b * (0.5 + 0.9 * pulse(p, 6))); } },
    wave:     { dur: 1.5,  run(r, p) { const b = ease(p * 4) * ease((1 - p) * 4); r.wingL.rotation.z -= b * (2 + 0.35 * Math.sin(p * TAU * 4)); r.wingL.rotation.x -= 0.4 * b; } },
    spin:     { dur: 1.3,  run(r, p) { r.body.rotation.y += TAU * ease(p); r.body.position.y += 0.12 * bump(p); } },
    dance:    { dur: 2.1,  run(r, p) { const s = Math.sin(p * TAU * 4) * Math.pow(bump(p), 0.3); r.body.rotation.z += 0.18 * s; r.body.position.x += 0.1 * s; r.neck.rotation.x += 0.3 * pulse(p, 8) * Math.pow(bump(p), 0.3); } },
    shake:    { dur: 1.05, run(r, p) { const b = bump(p); r.body.rotation.z += 0.1 * Math.sin(p * TAU * 10) * b; r.body.scale.multiplyScalar(1 + 0.06 * b); } },
    nuzzle:   { dur: 1.35, run(r, p) { const b = bump(p); r.neck.rotation.z += 0.4 * b; r.neck.rotation.x -= 0.15 * b; r.eyesClosed = b > 0.3; } },
    talk:     { dur: 1.0,  run(r, p) { r.jaw.rotation.x += 0.4 * pulse(p, 6); r.neck.rotation.z += 0.15 * Math.sin(p * TAU); } },
    whistle:  { dur: 1.7,  run(r, p) { const b = bump(p); r.neck.rotation.x -= 0.4 * b; r.jaw.rotation.x += 0.22 * pulse(p, 8) * b; } },
    playdead: { dur: 2.6,  run(r, p) { const k = p < 0.2 ? ease(p / 0.2) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3); r.body.rotation.z -= 1.45 * k; r.body.position.y += 0.15 * k; r.eyesClosed = k > 0.6; } },
    loop:     { dur: 2.3,  run(r, p) { const a = TAU * ease(p); r.body.position.x += 0.7 * Math.sin(a); r.body.position.y += 0.7 * (1 - Math.cos(a)); r.body.rotation.z -= a; flap(r, 0.4 + 0.9 * pulse(p, 10)); } },
    fetch:    { dur: 1.8,  run(r, p) { const b = bump(p); r.body.position.x += 0.8 * b; r.neck.rotation.x += 0.6 * pulse(p, 2) * b; } },
    stepup:   { dur: 1.5,  run(r, p) { const b = bump(p); r.feet[1].position.y += 0.18 * b; r.feet[1].position.z += 0.08 * b; r.body.rotation.z += 0.08 * b; r.body.position.x += 0.08 * b; } },
    tilt:     { dur: 1.1,  run(r, p) { r.neck.rotation.z += 0.5 * bump(p); } },
    refuse:   { dur: 0.7,  run(r, p) { r.neck.rotation.y += 0.4 * Math.sin(p * TAU * 2) * bump(p); } },
  };

  function idle(r, t, sleeping) {
    r.body.scale.y *= 1 + 0.012 * Math.sin(t * (sleeping ? 1.4 : 2.4));
    r.tail.rotation.x += 0.03 * Math.sin(t * 1.3);
    if (sleeping) {
      r.neck.rotation.x += 0.55;
      r.head.rotation.y += 0.5;
      r.eyesClosed = true;
      return;
    }
    r.head.rotation.y += 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    r.head.rotation.z += 0.12 * Math.sin(t * 0.29 + 2);
    if (t % 4.2 < 0.14) r.eyesClosed = true;   // blink
  }

  // ---- The view ---------------------------------------------------------------

  function mount(container) {
    if (!THREE || !container || !webglAvailable()) return null;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (e) {
      return null;
    }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = 'bird3d';
    canvas.setAttribute('aria-hidden', 'true');
    container.insertBefore(canvas, container.querySelector('.bird'));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5a7d4a, 1.0);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2.5, 4, 3.5);
    const fill = new THREE.DirectionalLight(0xffe7c4, 0.4);
    fill.position.set(-3, 1, 2);
    scene.add(hemi, sun, fill);

    const bark = new THREE.MeshStandardMaterial({ color: '#7A5134', roughness: 0.95 });
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 14, 20), bark);
    branch.rotation.z = Math.PI / 2;
    branch.position.set(0, -0.12, 0.05);
    scene.add(branch);

    let rig = null;
    let key = '';
    let anim = null;
    let sleeping = false;
    let night = 0;
    let userYaw = 0;
    let drag = null;
    let onScreen = true;
    let raf = 0;
    let lastT = performance.now() / 1000;
    const calm = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.set(0, 0.95, 5.7 / Math.min(1, Math.max(0.7, w / h)));
      camera.lookAt(0, 0.72, 0);
      camera.updateProjectionMatrix();
    }

    function frame(ms) {
      raf = 0;
      const t = ms / 1000;
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      if (rig) {
        rig.pivots.forEach((o, i) => {
          o.position.copy(rig.rest[i][0]);
          o.rotation.copy(rig.rest[i][1]);
          o.scale.copy(rig.rest[i][2]);
        });
        rig.eyesClosed = false;
        idle(rig, t, sleeping);
        if (anim) {
          const p = (t - anim.start) / anim.dur;
          if (p >= 1) anim = null;
          else anim.run(rig, p);
        }
        if (rig.eyesClosed) rig.eyes.forEach((e) => { e.scale.y = 0.12; });
        if (!drag) userYaw *= Math.exp(-dt * 3);
        rig.root.rotation.y = BASE_YAW + userYaw;
      }
      night += ((sleeping ? 1 : 0) - night) * Math.min(1, dt * 2);
      hemi.intensity = 1.0 - 0.6 * night;
      sun.intensity = 1.4 - 1.05 * night;
      fill.intensity = 0.4 - 0.2 * night;
      renderer.render(scene, camera);
      schedule();
    }

    function schedule() {
      if (!raf && onScreen && canvas.isConnected) raf = requestAnimationFrame(frame);
    }

    const resizer = new ResizeObserver(resize);
    resizer.observe(container);
    const watcher = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      schedule();
    });
    watcher.observe(container);

    // Drag sideways to turn the bird; it swings back when you let go.
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, yaw: userYaw };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) userYaw = drag.yaw + (e.clientX - drag.x) * 0.012;
    });
    const endDrag = () => {
      drag = null;
      userYaw = Math.atan2(Math.sin(userYaw), Math.cos(userYaw));
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    resize();
    schedule();

    return {
      setBird(bird, wearing) {
        const next = JSON.stringify([bird, wearing || {}]);
        if (next === key) return;
        key = next;
        if (rig) {
          scene.remove(rig.root);
          rig.mats.forEach((m) => m.dispose());
        }
        rig = build(bird, wearing);
        scene.add(rig.root);
      },
      play(name) {
        const a = ANIMS[name];
        if (a && !calm) anim = { run: a.run, dur: a.dur, start: performance.now() / 1000 };
      },
      setSleeping(value) { sleeping = !!value; },
      dispose() {
        cancelAnimationFrame(raf);
        raf = 0;
        resizer.disconnect();
        watcher.disconnect();
        if (rig) rig.mats.forEach((m) => m.dispose());
        bark.dispose();
        branch.geometry.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      },
    };
  }

  root.ParrotBird3D = { mount, animations: Object.keys(ANIMS) };
})(window);
