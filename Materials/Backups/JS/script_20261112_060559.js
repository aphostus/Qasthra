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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
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
  const N = matchMedia('(pointer:coarse)').matches ? 46 : 58;
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
  dark.addEventListener('change', () => { theme(); lit.fill(1); });
  window.addEventListener('themechange', () => { theme(); lit.fill(1); });

  // ---------- random animation state ----------
  const glowSyn = new Float32Array(synCount);
  const lit = new Uint8Array(synCount).fill(1);
  const glowNode = new Float32Array(N * 2);
  const rnd = (a, b) => a + Math.random() * (b - a);

  function pulse() {
    // a random input fires: it lights, then a random subset of its links flash through to outputs
    const i = (Math.random() * N) | 0;
    glowNode[i] = 1;
    const fan = 6 + ((Math.random() * 18) | 0);
    for (let n = 0; n < fan; n++) {
      const j = (Math.random() * N) | 0;
      glowSyn[i * N + j] = 1; lit[i * N + j] = 1;
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
    if (!visible || document.hidden) { last = now; return; }
    if (now - lastDraw < FRAME_MS) return;
    lastDraw = now;
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
    let changed = false;
    for (let i = 0; i < synCount; i++) {
      let g = glowSyn[i]; if (g < .004 && !lit[i]) continue; changed = true; g *= decay; if (g < .004) { g = 0; lit[i] = 0; } else lit[i] = 1; glowSyn[i] = g;
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
    if (changed) lineAttr.needsUpdate = true;
    if (changed) syns.instanceColor.needsUpdate = true;
    nodes.instanceColor.needsUpdate = true;
    nodes.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }

  let visible = true, lastDraw = 0;
  const FRAME_MS = matchMedia('(pointer:coarse)').matches ? 28 : 0;
  if ('IntersectionObserver' in window) new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(host);
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

// ---------- database (Supabase) ----------
window.db = (window.supabase && window.supabase.createClient) ? window.supabase.createClient('https://kidfwfzzoetisryjnnlh.supabase.co', 'sb_publishable_Dw-lSo7BWbtF-oihZt7QBA_i_2wV8Dn') : null;
// ---------- dashboard picker (GitHub / Supabase) ----------
(() => {
  const box = document.querySelector('.actions');
  const dash = document.getElementById('dashBtn');
  const show = document.getElementById('showBtn');
  const pick = document.getElementById('dashPick');
  const info = document.getElementById('dashInfo');
  const tbtn = document.getElementById('themeToggle');
  if (!box || !dash || !show || !pick || !tbtn) return;
  const opts = Array.from(pick.querySelectorAll('.dash-opt'));
  let open = false, choice = null, w0 = 0, savedLabel = '', t1, t2, t3;
  const label = () => tbtn.setAttribute('aria-label', !open ? savedLabel : (choice ? 'Confirm choice' : 'Cancel'));
  const setPick = (c) => {
    choice = c;
    if (c) pick.dataset.sel = c; else delete pick.dataset.sel;
    opts.forEach((o) => { const on = o.dataset.v === c; o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); });
    box.classList.toggle('has-pick', !!c);
    label();
  };
  const fit = () => {
    dash.style.transition = 'none';
    dash.style.width = ''; dash.style.marginRight = '';
    void dash.offsetWidth;
    w0 = dash.getBoundingClientRect().width;
    const w1 = Math.max(w0, show.getBoundingClientRect().right - dash.getBoundingClientRect().left);
    dash.style.width = w0 + 'px';
    dash.style.marginRight = '0px';
    void dash.offsetWidth;
    dash.style.transition = '';
    void dash.offsetWidth;
    dash.style.width = w1 + 'px';
    dash.style.marginRight = (w0 - w1) + 'px';
    pick.style.left = dash.offsetLeft + 'px';
    pick.style.top = dash.offsetTop + 'px';
    pick.style.width = w1 + 'px';
    pick.style.height = dash.offsetHeight + 'px';
    pick.style.borderRadius = getComputedStyle(dash).borderRadius;
    if (info) { info.style.left = (show.offsetLeft + (show.offsetWidth - info.offsetWidth) / 2) + 'px'; info.style.top = (show.offsetTop + (show.offsetHeight - info.offsetHeight) / 2) + 'px'; }
  };
  const openIt = () => {
    if (open) return;
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); box.classList.remove('pick-on');
    if (!box.classList.contains('dash-open')) savedLabel = tbtn.getAttribute('aria-label') || '';
    open = true;
    box.classList.add('dash-open');
    fit();
    label();
    setPick('github');
    t1 = setTimeout(() => box.classList.add('pick-on'), 330);
  };
  const close = () => {
    if (!open) return;
    open = false;
    clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    box.classList.remove('pick-on');
    t2 = setTimeout(() => { dash.style.width = w0 + 'px'; dash.style.marginRight = '0px'; }, 180);
    t3 = setTimeout(() => { box.classList.remove('dash-open'); dash.style.width = ''; dash.style.marginRight = ''; label(); }, 560);
  };
  dash.addEventListener('click', openIt);
  opts.forEach((o) => o.addEventListener('click', () => { if (!open) return; if (choice === o.dataset.v) close(); else setPick(o.dataset.v); }));
  tbtn.addEventListener('click', (e) => {
    if (!open) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if(!choice){close();return;}var go=async()=>{if(!window.db){alert('Auth is not available. Check your connection.');return;}var d=location.origin+location.pathname.replace(/[^\/]*$/,'')+'Pages/dashboard/dashboard.html?v='+choice;try{var r=await window.db.auth.getSession();if(r.data&&r.data.session){location.href=d;return;}var o=await window.db.auth.signInWithOAuth({provider:choice,options:{redirectTo:d}});if(o.error)throw o.error;}catch(x){alert('Sign-in failed: '+(x.message||x));}};go();
  }, true);
  addEventListener('resize', () => { if (open) fit(); });
})();

// ---------- contact & support views: same page, new render, top nav stays ----------
(() => {
  const page = document.getElementById('page');
  const nav = document.querySelector('.nav');
  const menu = document.getElementById('menuToggle');
  if (!page || !nav) return;
  const views = ['qa', 'info', 'ps', 'sandbox', 'showcase', 'contact', 'support'];
  const triggers = Array.from(document.querySelectorAll('[data-view]'));
  const render = () => {
    const h = location.hash.slice(1);
    const v = views.includes(h) ? h : '';
    if (v) document.body.dataset.view = v; else delete document.body.dataset.view;
    page.hidden = !v;
    triggers.forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    nav.classList.remove('open');
    if (menu) { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu'); }
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
  };
  triggers.forEach((t) => t.addEventListener('click', () => { location.hash = t.dataset.view === 'home' ? '' : t.dataset.view; }));
  window.addEventListener('hashchange', render);
  render();
})();
// ---------- nav showcase button: show only when hero showcase button is out of view ----------
(() => {
  const nb = document.querySelector('.nav-center');
  const hb = document.getElementById('showBtn');
  if (!nb || !hb || !('IntersectionObserver' in window)) return;
  new IntersectionObserver((en) => nb.classList.toggle('show', !en[0].isIntersecting)).observe(hb);
})();
// ---------- view renders: informations, contact, support ----------
(() => { const box = document.querySelector('#page .page-in'); if (!box) return; const data = { info: { t: 'Informations', d: ['Everything about how Qasthra works.', 'Guides and references in one place.'] }, contact: { t: 'Contact', d: ['Questions, ideas and partnerships.', 'We reply as soon as we can.'] }, support: { t: 'Support', d: ['Help with your account and setup.', 'Tell us what went wrong.'] } }; const draw = () => { const x = data[location.hash.slice(1)]; if (!x) return; box.innerHTML = '<header class="view-head"><h2>' + x.t + '</h2><p class="sub">' + x.d[0] + '<br>' + x.d[1] + '</p></header>'; }; window.addEventListener('hashchange', draw); draw(); })();
// ---------- dashboard picker: hold (i) to read, release or move away to close ----------
(() => { const info = document.getElementById('dashInfo'), tip = document.getElementById('dashTip'), box = document.querySelector('.actions'); if (!(info && tip && box)) return; const set = (on) => tip.classList.toggle('on', on); const end = () => set(false); info.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); try { info.setPointerCapture(e.pointerId); } catch (x) {} }); info.addEventListener('pointermove', (e) => { const r = info.getBoundingClientRect(); const d = Math.max(r.left - e.clientX, e.clientX - r.right, r.top - e.clientY, e.clientY - r.bottom); if (d > 8) end(); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => info.addEventListener(t, end)); info.addEventListener('contextmenu', (e) => e.preventDefault()); new MutationObserver(() => { if (!box.classList.contains('pick-on')) end(); }).observe(box, { attributes: true, attributeFilter: ['class'] }); })();
