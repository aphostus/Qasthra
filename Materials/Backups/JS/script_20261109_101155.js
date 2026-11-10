(() => {
  const host = document.getElementById('scene');
  if (!host || typeof THREE === 'undefined') return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = matchMedia('(prefers-color-scheme: dark)');

  // ---------- renderer ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 200);
  camera.position.set(0, 0, 34);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const root = new THREE.Group();
  scene.add(root);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  // ---------- object: two helical columns, fully linked ----------
  const N = 58;
  const inPos = [], outPos = [];
  for (let i = 0; i < N; i++) {
    const a = i * 2.4, y = (1 - 2 * (i + .5) / N) * 9;
    inPos.push(new THREE.Vector3(-6 + Math.cos(a) * 1.4, y, Math.sin(a) * 3.6));
    outPos.push(new THREE.Vector3(6 + Math.cos(a) * 1.4, y, -Math.sin(a) * 3.6));
  }

  const nodeGeo = new THREE.SphereGeometry(.4, 14, 10);
  const synGeo = new THREE.OctahedronGeometry(1);
  const nodes = new THREE.InstancedMesh(nodeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N * 2);
  const synCount = N * N;
  const syns = new THREE.InstancedMesh(synGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), synCount);
  nodes.frustumCulled = syns.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const linePos = new Float32Array(synCount * 6);
  const synMid = [];
  let k = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++, k++) {
      const p = inPos[i], q = outPos[j];
      linePos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6);
      dummy.position.copy(p).lerp(q, .5);
      dummy.scale.setScalar(.09);
      dummy.updateMatrix();
      syns.setMatrixAt(k, dummy.matrix);
    }
  }
  for (let i = 0; i < N * 2; i++) {
    dummy.position.copy(i < N ? inPos[i] : outPos[i - N]);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    nodes.setMatrixAt(i, dummy.matrix);
  }

  const lineCol = new Float32Array(synCount * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lineAttr = new THREE.BufferAttribute(lineCol, 3);
  lineAttr.setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('color', lineAttr);
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  lines.frustumCulled = false;

  root.add(lines, syns, nodes);

  // ---------- theme colours (white on dark site, black on light site) ----------
  const fg = new THREE.Color(), lineBase = new THREE.Color(), nodeBase = new THREE.Color(), tmp = new THREE.Color();
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : dark.matches;
  };
  function theme() {
    if (isDark()) { fg.set('#f5f5f4'); lineBase.set('#1c1c1c'); nodeBase.set('#6b6b6b'); }
    else { fg.set('#0a0a0a'); lineBase.set('#d4d4d8'); nodeBase.set('#8e8e94'); }
  }
  theme();
  dark.addEventListener('change', theme);
  window.addEventListener('themechange', theme);

  // ---------- random animation state ----------
  const glowSyn = new Float32Array(synCount);
  const glowNode = new Float32Array(N * 2);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function pulse() {
    // a random input fires: it lights, then a random subset of its links flash through to outputs
    const i = (Math.random() * N) | 0;
    glowNode[i] = 1;
    const fan = 6 + ((Math.random() * 18) | 0);
    for (let n = 0; n < fan; n++) {
      const j = (Math.random() * N) | 0;
      glowSyn[i * N + j] = 1;
      glowNode[N + j] = Math.max(glowNode[N + j], rnd(.5, 1));
    }
  }

  let spinV = 0, spinTarget = .15, rotX = .15, rotY = -.35;
  let nextSpin = 0, nextPulse = 0, last = performance.now();

  // ---------- drag / wheel interaction ----------
  let offX = 0, offY = 0, dragging = false, lastTouch = 0, px = 0, py = 0;
  const TAU = Math.PI * 2, MAXX = 1.3;
  const clampX = (v) => Math.max(-MAXX, Math.min(MAXX, v));
  const bump = () => { lastTouch = performance.now(); };
  host.style.touchAction = 'none';
  host.style.userSelect = 'none';
  host.style.cursor = 'grab';
  host.addEventListener('pointerdown', (e) => {
    dragging = true; px = e.clientX; py = e.clientY; bump();
    host.setPointerCapture(e.pointerId);
    host.style.cursor = 'grabbing';
  });
  host.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (pinching) return;
    offY += (e.clientX - px) * .008;
    offX = clampX(offX + (e.clientY - py) * .008);
    px = e.clientX; py = e.clientY; bump();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    host.style.cursor = 'grab';
    bump();
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);
  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) { zoomBy(e.deltaY * .05); bump(); return; }
    offY += e.deltaX * .004;
    offX = clampX(offX - e.deltaY * .004);
    bump();
  }, { passive: false });

  // ---------- zoom: pinch or ctrl+wheel, clamped so it cannot over-zoom ----------
  const ZMIN = -10, ZMAX = 18;
  let zoomOff = 0, pinching = false, pinchD = 0;
  const pts = new Map();
  const zoomBy = (d) => { zoomOff = Math.max(ZMIN, Math.min(ZMAX, zoomOff + d)); };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  host.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinching = true; pinchD = dist(); }
  });
  host.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinching && pts.size === 2) {
      const d = dist();
      zoomBy(-(d - pinchD) * .08);
      pinchD = d; bump();
    }
  });
  const endPt = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinching = false;
    if (pts.size === 1) { const r = [...pts.values()][0]; px = r.x; py = r.y; }
  };
  host.addEventListener('pointerup', endPt);
  host.addEventListener('pointercancel', endPt);
  host.addEventListener('lostpointercapture', endPt);
  const tint = new THREE.Color();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    const m = reduce ? .15 : 1;

    // random drift: speed and direction change every few seconds, eased
    if (now > nextSpin) {
      spinTarget = rnd(-.45, .45) * (Math.random() < .25 ? 2 : 1);
      nextSpin = now + rnd(2500, 6000);
    }
    spinV += (spinTarget - spinV) * Math.min(1, dt * .8);
    rotY += spinV * dt * m;
    rotX = .18 + Math.sin(now * .00035) * .22 + Math.sin(now * .00091) * .06;
    // after 1.5s without touch, the tilt/turn eases back to the normal face
    if (!dragging && !pinching && now - lastTouch > 1500) {
      offY -= Math.round(offY / TAU) * TAU;
      const back = 1 - Math.exp(-dt * 1.2);
      offX -= offX * back;
      offY -= offY * back;
      zoomOff -= zoomOff * back;
    }
    camera.position.z = 34 + zoomOff;
    root.rotation.set(rotX + offX, rotY + offY, 0);
    root.position.y = Math.sin(now * .0006) * .35;

    if (now > nextPulse) {
      const burst = Math.random() < .3 ? 3 : 1;
      for (let b = 0; b < burst; b++) pulse();
      nextPulse = now + rnd(90, 420) / m;
    }

    // decay + write colours
    const decay = Math.exp(-dt * 2.4);
    for (let i = 0; i < synCount; i++) {
      const g = glowSyn[i] *= decay;
      tint.copy(lineBase).lerp(fg, g);
      const o = i * 6;
      lineCol[o] = lineCol[o + 3] = tint.r;
      lineCol[o + 1] = lineCol[o + 4] = tint.g;
      lineCol[o + 2] = lineCol[o + 5] = tint.b;
      tmp.copy(nodeBase).lerp(fg, .15 + g * .85);
      syns.setColorAt(i, tmp);
    }
    for (let i = 0; i < N * 2; i++) {
      const g = glowNode[i] *= decay;
      tmp.copy(nodeBase).lerp(fg, .35 + g * .65);
      nodes.setColorAt(i, tmp);
      const s = 1 + g * .7;
      dummy.position.copy(i < N ? inPos[i] : outPos[i - N]);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      nodes.setMatrixAt(i, dummy.matrix);
    }
    lineAttr.needsUpdate = true;
    syns.instanceColor.needsUpdate = true;
    nodes.instanceColor.needsUpdate = true;
    nodes.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  resize();
  requestAnimationFrame(frame);
})();

// ---------- theme toggle (moon / sun) ----------
(() => {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const root = document.documentElement;
  const sys = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : sys.matches);
  const sync = () => btn.setAttribute('aria-label', isDark() ? 'Switch to light theme' : 'Switch to dark theme');
  sync();
  btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    sync();
    window.dispatchEvent(new Event('themechange'));
  });
})();

// ---------- mobile menu ----------
(() => {
  const btn = document.getElementById('menuToggle');
  const nav = document.querySelector('.nav');
  if (!btn || !nav) return;
  const set = (open) => {
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  btn.addEventListener('click', () => set(!nav.classList.contains('open')));
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width:561px)').addEventListener('change', () => set(false));
})();

// ---------- bento cards: rotating 3D objects (desktop only) ----------
(() => {
  if (typeof THREE === 'undefined') return;
  const cards = Array.from(document.querySelectorAll('.card'));
  if (!cards.length) return;
  const mq = matchMedia('(min-width:561px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : sysDark.matches; };
  const mainMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const dimMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: .6 });
  const dotMat = new THREE.PointsMaterial({ color: 0xffffff, size: .09 });
  const paint = () => { const d = isDark(); mainMat.color.set(d ? '#e7e7e6' : '#18181b'); dimMat.color.set(d ? '#8b8b90' : '#6f6f74'); dotMat.color.set(d ? '#f5f5f4' : '#0a0a0a'); };
  paint();
  sysDark.addEventListener('change', paint);
  window.addEventListener('themechange', paint);

  const edges = (geo, mat) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat ? mat : mainMat);
  const wire = (geo, mat) => new THREE.LineSegments(new THREE.WireframeGeometry(geo), mat ? mat : mainMat);
  const ring = (r, mat) => { const p = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); } return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p), mat ? mat : dimMat); };
  const segs = (arr, mat) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return new THREE.LineSegments(g, mat ? mat : dimMat); };
  const dots = (pts) => new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), dotMat);

  // one shape per card, in card order
  const shapes = [
    // Computational Database: stacked discs
    () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const c = edges(new THREE.CylinderGeometry(.95, .95, .32, 28)); c.position.y = (i - 1) * .55; g.add(c); } return g; },
    // Data Manipulation: twisting knot
    () => { const g = new THREE.Group(); g.add(wire(new THREE.TorusKnotGeometry(.62, .2, 64, 8, 2, 3))); return g; },
    // Quantum Protection: core inside orbit rings
    () => { const g = new THREE.Group(); g.add(edges(new THREE.IcosahedronGeometry(.42))); const a = ring(1), b = ring(1), c = ring(1); b.rotation.y = Math.PI / 3; c.rotation.y = -Math.PI / 3; g.add(a, b, c); return g; },
    // Machine Functions: gear
    () => { const g = new THREE.Group(); g.add(edges(new THREE.CylinderGeometry(.8, .8, .3, 16))); g.add(edges(new THREE.CylinderGeometry(.32, .32, .45, 14), dimMat)); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const t = edges(new THREE.BoxGeometry(.3, .3, .26)); t.position.set(Math.cos(a) * .9, 0, Math.sin(a) * .9); t.rotation.y = -a; g.add(t); } return g; },
    // Algorithmic Programming: nested polyhedra
    () => { const g = new THREE.Group(); g.add(edges(new THREE.DodecahedronGeometry(.95))); g.add(edges(new THREE.OctahedronGeometry(.5), dimMat)); return g; },
    // Dimensional Storage: cube inside a cube, corners linked
    () => { const g = new THREE.Group(); g.add(edges(new THREE.BoxGeometry(1.2, 1.2, 1.2))); g.add(edges(new THREE.BoxGeometry(.64, .64, .64), dimMat)); const s = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) s.push(.6 * x, .6 * y, .6 * z, .32 * x, .32 * y, .32 * z); g.add(segs(s)); return g; },
    // Operational Memory: lattice of points
    () => { const g = new THREE.Group(); const p = []; for (const x of [-.6, -.2, .2, .6]) for (const y of [-.6, -.2, .2, .6]) for (const z of [-.6, -.2, .2, .6]) p.push(new THREE.Vector3(x, y, z)); g.add(dots(p)); g.add(edges(new THREE.BoxGeometry(1.5, 1.5, 1.5), dimMat)); return g; },
    // Analytics Management: bars
    () => { const g = new THREE.Group(); [.5, 1, .7, 1.4, .9].forEach((h, i) => { const b = edges(new THREE.BoxGeometry(.26, h, .26)); b.position.set((i - 2) * .4, h / 2 - .6, 0); g.add(b); }); g.add(segs([-1, -.6, 0, 1, -.6, 0], mainMat)); return g; },
    // Cluster Organizer: connected cloud of points
    () => { const g = new THREE.Group(); const p = [], n = 22; for (let i = 0; i < n; i++) { const y = 1 - i / (n - 1) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; p.push(new THREE.Vector3(Math.cos(a) * r * .9, y * .9, Math.sin(a) * r * .9)); } const s = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (p[i].distanceTo(p[j]) < .85) s.push(p[i].x, p[i].y, p[i].z, p[j].x, p[j].y, p[j].z); g.add(segs(s)); g.add(dots(p)); return g; },
    // Parallel Transactions: parallel rings
    () => { const g = new THREE.Group(); for (const y of [-.55, 0, .55]) { const r = ring(.85, mainMat); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); } const s = []; for (const q of [[.85, 0], [-.85, 0], [0, .85], [0, -.85]]) s.push(q[0], -.55, q[1], q[0], .55, q[1]); g.add(segs(s)); return g; }
  ];
  const spd = [.7, -.6, .8, -.7, .6, -.8, .7, -.6, .8, -.7];

  const items = [];
  let renderer = null, camera = null, raf = 0, last = 0;
  const dpr = () => Math.min(window.devicePixelRatio, 2);
  const io = new IntersectionObserver((es) => es.forEach((e) => { const it = items.find((x) => x.card === e.target); if (it) it.vis = e.isIntersecting; }));
  const ro = new ResizeObserver((es) => es.forEach((e) => { const it = items.find((x) => x.cv === e.target); if (!it) return; const d = dpr(); it.cv.width = Math.round(e.contentRect.width * d); it.cv.height = Math.round(e.contentRect.height * d); it.w = it.cv.width; it.h = it.cv.height; }));

  function init() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(420, 420, false);
    renderer.setClearColor(0x000000, 0);
    camera = new THREE.PerspectiveCamera(40, 1, .1, 50);
    camera.position.z = 4.6;
    cards.forEach((card, i) => {
      if (!shapes[i]) return;
      const cv = document.createElement('canvas');
      cv.className = 'card-3d';
      cv.setAttribute('aria-hidden', 'true');
      card.appendChild(cv);
      const scene = new THREE.Scene();
      const g = shapes[i]();
      scene.add(g);
      items.push({ i, card, cv, ctx: cv.getContext('2d'), scene, g, w: 0, h: 0, vis: false });
      io.observe(card);
      ro.observe(cv);
    });
  }

  function frame(now) {
    if (!mq.matches) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    const m = reduce ? .2 : 1;
    items.forEach((it) => {
      if (!it.vis || !it.w) return;
      it.g.rotation.y += dt * spd[it.i] * m;
      it.g.rotation.x = .35 + Math.sin(now * .0006 + it.i) * .25;
      renderer.render(it.scene, camera);
      it.ctx.clearRect(0, 0, it.w, it.h);
      const s = Math.min(it.w, it.h);
      it.ctx.drawImage(renderer.domElement, (it.w - s) / 2, (it.h - s) / 2, s, s);
    });
  }

  function start() {
    if (!mq.matches) return;
    init();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  mq.addEventListener('change', start);
  start();
})();
