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
  host.addEventListener('lostpointercapture', release);
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
try { if (!localStorage.getItem('qk_purge1')) { Object.keys(localStorage).forEach((k) => { if (/^sb-.*-auth-token/.test(k) || k === 'supabase.auth.token') localStorage.removeItem(k); }); localStorage.setItem('qk_purge1', '1'); } } catch (x) {}
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
    const sr = show.getBoundingClientRect().right, tl = tbtn.getBoundingClientRect().left, iw = info ? info.offsetWidth : 0, roomy = !!info && (tl - sr) >= iw + 16;
    const w1 = Math.max(w0, sr - dash.getBoundingClientRect().left - (info && !roomy ? iw + 8 : 0));
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
    if (info) { info.style.left = (roomy ? show.offsetLeft + show.offsetWidth + (tbtn.offsetLeft - show.offsetLeft - show.offsetWidth - info.offsetWidth) / 2 : show.offsetLeft + show.offsetWidth - info.offsetWidth) + 'px'; info.style.top = (show.offsetTop + (show.offsetHeight - info.offsetHeight) / 2) + 'px'; }
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
    if(!choice){close();return;}var go=async()=>{if(!window.db){alert('Auth is not available. Check your connection.');return;}var d=location.origin+location.pathname.replace(/[^\/]*$/,'')+'Pages/dashboard/dashboard.html?v='+choice;try{var r=await window.db.auth.getSession();var ss=r.data&&r.data.session;if(ss&&window.qkLeft&&window.qkLeft(ss)<=0){try{await window.db.auth.signOut({scope:'local'});}catch(x){}ss=null;}if(ss){location.href=d;return;}var o=await window.db.auth.signInWithOAuth({provider:choice,options:{redirectTo:d,queryParams:choice==='github'?{prompt:'select_account'}:{}}});if(o.error)throw o.error;}catch(x){alert('Sign-in failed: '+(x.message||x));}};go();
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
  let pv = '', cur = '', swap; const popEl = document.getElementById('navPop'); const paint = () => { if (popEl) { popEl.classList.toggle('on', !!pv); popEl.setAttribute('aria-hidden', pv ? 'false' : 'true'); popEl.dataset.pv = pv; } triggers.forEach((t) => t.classList.toggle('active', t.dataset.view === pv || t.dataset.view === cur)); }; const setPop = (next) => { clearTimeout(swap); if (pv && next && next !== pv) { pv = ''; paint(); swap = setTimeout(() => { pv = next; paint(); }, 380); } else { pv = next; paint(); } }; const render = () => {
    const h = location.hash.slice(1);
    const v = (h === 'qa' || h === 'ps') ? '' : (views.includes(h) ? h : ''); cur = v; setPop(''); if (v) document.body.dataset.view = v; else delete document.body.dataset.view;
    page.hidden = !v;
    triggers.forEach((t) => t.classList.toggle('active', t.dataset.view === (pv || v)));
    nav.classList.remove('open');
    if (menu) { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open menu'); }
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('resize'));
  };
  triggers.forEach((t) => t.addEventListener('click', () => { const q = t.dataset.view === 'qa' || t.dataset.view === 'ps'; if (q) { setPop(pv === t.dataset.view ? '' : t.dataset.view); } else { setPop(''); location.hash = t.dataset.view; } }));
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
(() => { const box = document.querySelector('#page .page-in'); if (!box) return; const data = { info: { t: 'Informations', d: ['Everything about how Qasthra works.', 'Guides and references in one place.'] }, contact: { t: 'Contact', d: ['Questions, ideas and partnerships.', 'We reply as soon as we can.'] }, support: { t: 'Support', d: ['Help us improve the service and product.', 'Share suggestions, report bugs or send code.'] } }; const draw = () => { const x = data[location.hash.slice(1)]; if (!x) { box.innerHTML = ''; return; } box.innerHTML = '<header class="view-head"><h2>' + x.t + '</h2><p class="sub">' + x.d[0] + '<br>' + x.d[1] + '</p></header>'; }; window.addEventListener('hashchange', draw); draw(); })();
// ---------- dashboard picker: hold (i) to read, release or move away to close ----------
(() => { const info = document.getElementById('dashInfo'), tip = document.getElementById('dashTip'), box = document.querySelector('.actions'); if (!(info && tip && box)) return; const set = (on) => tip.classList.toggle('on', on); const end = () => set(false); info.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); try { info.setPointerCapture(e.pointerId); } catch (x) {} }); info.addEventListener('pointermove', (e) => { const r = info.getBoundingClientRect(); const d = Math.max(r.left - e.clientX, e.clientX - r.right, r.top - e.clientY, e.clientY - r.bottom); if (d > 8) end(); }); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => info.addEventListener(t, end)); info.addEventListener('contextmenu', (e) => e.preventDefault()); new MutationObserver(() => { if (!box.classList.contains('pick-on')) end(); }).observe(box, { attributes: true, attributeFilter: ['class'] }); })();
// ---------- contact & support content: info, safe forms, Supabase ----------
(() => { const box = document.querySelector('#page .page-in'); if (!box) return; const BAD = /[<>{}\[\]()`$;\\|^~"]|--|\/\*|\*\/|&#|%3c|%3e|javascript:|\bor\s+1\s*=\s*1|\b(select|insert|update|delete|drop|union|alter|exec|script|truncate|onerror|onload)\b/i; const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/; const GH = /^https:\/\/github\.com\/[A-Za-z0-9_.\/-]{1,120}$/; const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); const PH = { name: 'Your name', email: 'you@example.com', phone: '+63 900 000 0000', link: 'https://github.com/aphostus/Qasthra' }; const AC = { name: 'name', email: 'email', phone: 'tel' }; const inp = (n, l, t, m, req) => '<label class="cs-f"><span>' + l.replace(' *', ' <em>*</em>') + '</span><input name="' + n + '" type="' + t + '" maxlength="' + m + '" autocomplete="' + (AC[n] || 'off') + '" placeholder="' + (PH[n] || '') + '"' + (t === 'tel' ? ' inputmode="tel"' : '') + (req ? ' required' : '') + '></label>'; const area = '<label class="cs-f"><span>Message <em>*</em></span><textarea name="message" rows="5" maxlength="1000" placeholder="Write your message here" required></textarea></label>'; const hp = '<div class="cs-hp" aria-hidden="true"><input name="website" tabindex="-1" autocomplete="off"></div>'; const tail = '<button class="btn btn-mono cs-send" type="submit">Send message</button><p class="cs-note" role="status" aria-live="polite"></p></form></div>'; const HTML = { contact: '<div class="cs"><div class="cs-info"><div class="cs-card"><i class="cs-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></i><div class="cs-txt"><b>Email</b><a href="mailto:Qasthra@gmail.com">Qasthra@gmail.com</a></div><button class="cs-copy" type="button" data-copy="Qasthra@gmail.com">Copy</button></div><div class="cs-card"><i class="cs-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg></i><div class="cs-txt"><b>Phone</b><a href="tel:+639245266251">+63 924 526 6251</a></div><button class="cs-copy" type="button" data-copy="+63 924 526 6251">Copy</button></div></div><form class="cs-form" novalidate data-v="contact"><h3 class="cs-title">Send us a message</h3><p class="cs-hint">Fields marked * are required.</p>' + inp('name', 'Name *', 'text', 60, 1) + '<div class="cs-row">' + inp('email', 'Email *', 'email', 120, 1) + inp('phone', 'Phone *', 'tel', 30, 1) + '</div>' + area + hp + tail, support: '<div class="cs"><div class="cs-info"><div class="cs-card"><i class="cs-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg></i><div class="cs-txt"><b>GitHub</b><a class="cs-stretch" href="https://github.com/aphostus/Qasthra" target="_blank" rel="noopener noreferrer">github.com/aphostus/Qasthra</a></div></div><div class="cs-card"><i class="cs-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/></svg></i><div class="cs-txt"><b>Help us improve</b><span>Suggest features, report bugs or share code.</span></div></div></div><form class="cs-form" novalidate data-v="support"><h3 class="cs-title">Share your idea</h3><p class="cs-hint">Fields marked * are required.</p><div class="cs-row">' + inp('name', 'Name *', 'text', 60, 1) + inp('email', 'Email', 'email', 120, 0) + '</div><div class="cs-row">' + inp('phone', 'Phone', 'tel', 30, 0) + '<label class="cs-f"><span>Type</span><select name="kind"><option value="Suggestion">Suggestion</option><option value="Feature request">Feature request</option><option value="Bug report">Bug report</option><option value="Code contribution">Code contribution</option><option value="Performance issue">Performance issue</option><option value="Security concern">Security concern</option><option value="Design feedback">Design feedback</option><option value="Documentation">Documentation</option><option value="Integration request">Integration request</option><option value="Partnership">Partnership</option><option value="Question">Question</option><option value="Other">Other</option></select></label></div>' + inp('link', 'GitHub', 'url', 200, 0) + area + hp + tail }; const draw = () => { const h = location.hash.slice(1); if (!HTML[h] || box.querySelector('.cs')) return; box.insertAdjacentHTML('beforeend', HTML[h]); }; window.addEventListener('hashchange', draw); draw(); box.addEventListener('submit', async (e) => { const f = e.target.closest('form.cs-form'); if (!f) return; e.preventDefault(); const note = f.querySelector('.cs-note'), btn = f.querySelector('button'); const say = (t, ok) => { note.textContent = t; note.dataset.ok = ok ? '1' : '0'; }; const v = f.dataset.v, d = new FormData(f); if (d.get('website')) { say('Thanks!', 1); f.reset(); return; } const row = {}; for (const k of ['name', 'email', 'phone', 'kind', 'link', 'message']) { if (!d.has(k)) continue; const x = clean(d.get(k)); if (x && BAD.test(x)) { say('Please remove brackets, quotes and code symbols, then try again.', 0); return; } row[k] = x || null; } if (!row.message || row.message.length < 5) { say('Please write a message of at least 5 characters.', 0); return; } if (!row.name) { say('Please enter your name.', 0); return; } if (v === 'contact' && !row.phone) { say('Please enter your phone number.', 0); return; } if ((v === 'contact' || row.email) && !EMAIL.test(row.email || '')) { say('Please enter a valid email address.', 0); return; } if (row.link && !GH.test(row.link)) { say('Link must start with https://github.com/', 0); return; } if (row.phone && !/^\+?[0-9][0-9 -]{5,18}[0-9]$/.test(row.phone)) { say('Please enter a valid phone number.', 0); return; } try { if (Date.now() - Number(localStorage.getItem('cs_last') || 0) < 30000) { say('Please wait a moment before sending again.', 0); return; } } catch (x) {} if (!window.db) { say('Connection unavailable. Please try again later.', 0); return; } btn.disabled = true; try { const r = await window.db.from(v === 'contact' ? 'contact_messages' : 'support_suggestions').insert([row]); if (r.error) throw r.error; try { localStorage.setItem('cs_last', String(Date.now())); } catch (x) {} f.reset(); say('Sent. Thank you!', 1); } catch (x) { say('Could not send. Please try again later.', 0); } btn.disabled = false; }); })();
// ---------- contact & support: copy buttons ---------- (() => { const box = document.querySelector('#page .page-in'); if (!box) return; box.addEventListener('click', (e) => { const b = e.target.closest('.cs-copy'); if (!b) return; const t = b.dataset.copy; const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }; const fb = () => { const x = document.createElement('textarea'); x.value = t; x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); done(); } catch (z) {} x.remove(); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fb); else fb(); }); })();
// ---------- subscribe popup: GitHub / Notion quick access ----------
(() => { const btn = document.getElementById('subBtn'), pop = document.getElementById('subPop'); if (!(btn && pop)) return; const f = pop.querySelector('form'), note = pop.querySelector('.sub-note'), hl = document.getElementById('subHL'), hin = f.elements.handle, segs = pop.querySelectorAll('.sub-seg button'); let prov = 'github'; const GH = /^[A-Za-z0-9-]{1,39}$/, NO = /^(https:[/][/]([a-z0-9-]+[.])?notion[.](so|site)[/][A-Za-z0-9_./-]{0,120}|https:[/][/]([a-z0-9-]+[.])?notion[.]com[/][A-Za-z0-9_./-]{0,120})$/, EM = /^[^ @]+@[^ @]+[.][^ @]+$/, BAD = /[<>{}`$;|^~"]|--|javascript:/i; const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); const say = (t, ok) => { note.textContent = t; note.dataset.ok = ok ? '1' : '0'; }; const setProv = (p) => { prov = p; segs.forEach((s) => s.classList.toggle('on', s.dataset.p === p)); hl.textContent = p === 'github' ? 'GitHub username' : 'Notion page link'; hin.placeholder = p === 'github' ? 'aphostus' : 'https://www.notion.so/your-page'; }; segs.forEach((s) => s.addEventListener('click', () => setProv(s.dataset.p)));
const fill = async () => { try { if (!window.db) return; const r = await window.db.auth.getSession(); const u = r.data && r.data.session && r.data.session.user; if (!u) return; const m = u.user_metadata || {}, p = (u.app_metadata && u.app_metadata.provider) || ''; if (p === 'notion') { setProv('notion'); hin.value = hin.value || ''; } else { setProv('github'); if (!hin.value) hin.value = m.user_name || m.preferred_username || ''; } if (!f.elements.email.value && u.email) f.elements.email.value = u.email; if (!f.elements.phone.value && u.phone) f.elements.phone.value = u.phone; } catch (x) {} };
const set = (on) => { pop.classList.toggle('on', on); pop.setAttribute('aria-hidden', on ? 'false' : 'true'); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) btn.setAttribute('aria-label', 'Close'); else btn.removeAttribute('aria-label'); if (on) { say('', 1); fill(); setTimeout(() => hin.focus({ preventScroll: true }), 60); } }; btn.addEventListener('click', (e) => { e.stopPropagation(); set(!pop.classList.contains('on')); }); pop.addEventListener('click', (e) => e.stopPropagation()); document.addEventListener('click', () => set(false)); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
f.addEventListener('submit', async (e) => { e.preventDefault(); if (f.elements.website.value) { say('Thanks!', 1); return; } const handle = clean(hin.value), email = clean(f.elements.email.value), phone = clean(f.elements.phone.value); if (!handle || BAD.test(handle) || !(prov === 'github' ? GH.test(handle) : NO.test(handle))) { say(prov === 'github' ? 'Enter a valid GitHub username.' : 'Enter a valid Notion page link.', 0); return; } if (email && (BAD.test(email) || !EM.test(email))) { say('Please enter a valid email address.', 0); return; } if (phone && !/^[+]?[0-9][0-9 -]{5,18}[0-9]$/.test(phone)) { say('Please enter a valid phone number.', 0); return; } try { if (Date.now() - Number(localStorage.getItem('sub_last') || 0) < 30000) { say('Please wait a moment before trying again.', 0); return; } } catch (x) {} if (!window.db) { say('Connection unavailable. Please try again later.', 0); return; } const go = f.querySelector('.sub-go'); go.disabled = true; try { const r = await window.db.from('subscribers').insert([{ provider: prov, handle: handle, email: email || null, phone: phone || null }]); if (r.error && r.error.code !== '23505') throw r.error; try { localStorage.setItem('sub_last', String(Date.now())); } catch (x) {} say(r.error ? 'You are already subscribed.' : 'Subscribed. Thank you!', 1); btn.querySelector('.sub-lbl').textContent = 'Subscribed'; setTimeout(() => set(false), 1400); } catch (x) { say('Could not subscribe. Please try again later.', 0); } go.disabled = false; }); })();

// ---------- quick login: 30 s one-tap dashboard ----------
(() => {
  const dash = document.getElementById('dashBtn');
  if (!dash || !window.db) return;
  const TTL = 30000;
  const qkAt = (x) => { let s = 0; try { s = Number(localStorage.getItem('qk_seen')) || 0; } catch (e) {} return Math.max(Date.parse(x) || 0, s); };
  let tm = null, raf = 0, prov = '', until = 0;
  const off = () => { if (window.__qkPrev) return; clearTimeout(tm); tm = null; prov = ''; until = 0; cancelAnimationFrame(raf); dash.classList.remove('qk'); dash.style.removeProperty('--qp'); };
  const check = async () => {
    try {
      const r = await window.db.auth.getSession();
      const s = r.data && r.data.session;
      if (!s) { off(); return; }
      const at = qkAt(s.user.last_sign_in_at || '');
      if (isNaN(at)) { off(); return; }
      const used = Math.round(Math.min(TTL, Math.max(0, Date.now() - at)));
      const left = TTL - used;
      if (left <= 0) { off(); try { localStorage.removeItem('qk_seen'); } catch (e) {} await window.db.auth.signOut({ scope: 'local' }); return; }
      const p = (s.user.app_metadata && s.user.app_metadata.provider) || '';
      prov = /^(github|notion)$/.test(p) ? p : 'github';
      until = Date.now() + left;
      clearTimeout(tm);
      dash.classList.remove('qk');
      void dash.offsetWidth;
      dash.classList.add('qk');
      const t0 = Date.now() - used;
      cancelAnimationFrame(raf);
      const tick = () => { const k = Math.max(0, 1 - (Date.now() - t0) / TTL); dash.style.setProperty('--qp', window.qkDeg(dash, k)); if (k > 0) raf = requestAnimationFrame(tick); else check(); };
      tick();
      tm = setTimeout(check, left + 60);
    } catch (x) {}
  };
  dash.parentNode.addEventListener('click', (e) => {
    if (!prov || !e.target.closest('#dashBtn')) return;
    if (Date.now() >= until) { check(); return; }
    e.stopImmediatePropagation();
    e.preventDefault();
    location.href = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'Pages/dashboard/dashboard.html?v=' + prov;
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('pageshow', check);
  window.db.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(check, 0); });
  check();
})();


// ---------- quick login: ring preview (?qk=1) ----------
(() => {
  if (!/[?&]qk=1/.test(location.search)) return;
  setTimeout(() => {
    const d = document.getElementById('dashBtn');
    if (!d) return;
    const t0 = Date.now();
    window.__qkPrev = 1; d.classList.add('qk');
    const tick = () => { const k = Math.max(0, 1 - (Date.now() - t0) / 30000); d.style.setProperty('--qp', window.qkDeg(d, k)); if (k > 0) requestAnimationFrame(tick); else { window.__qkPrev = 0; d.classList.remove('qk'); } };
    tick();
  }, 1500);
})();

// ---------- subscribe: auto format ----------
(() => {
  const pop = document.getElementById('subPop');
  const f = pop && pop.querySelector('form');
  if (!f) return;
  const prov = () => { const b = pop.querySelector('.sub-seg button.on'); return b ? b.dataset.p : 'github'; };
  const fmt = {
    handle: (v) => {
      v = v.replace(/\s+/g, ' ').trim();
      if (!v) return v;
      if (prov() === 'github') return v.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/^@+/, '').replace(/[\/?#].*$/, '');
      v = v.replace(/^http:\/\//i, 'https://');
      if (!/^https:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
      return v.replace(/[?#].*$/, '');
    },
    email: (v) => v.replace(/\s+/g, '').toLowerCase(),
    phone: (v) => {
      v = v.replace(/\s+/g, ' ').trim();
      const p = v.replace(/\D/g, '');
      const m = /^(?:0|63)?(9\d{9})$/.exec(p);
      if (!m || (v[0] === '+' && p.slice(0, 2) !== '63')) return v;
      return '+63 ' + m[1].slice(0, 3) + ' ' + m[1].slice(3, 6) + ' ' + m[1].slice(6);
    }
  };
  const run = () => {
    const h = f.elements.handle, e = f.elements.email, p = f.elements.phone;
    if (h.value) h.value = fmt.handle(h.value);
    if (e.value) e.value = fmt.email(e.value);
    if (p.value) p.value = fmt.phone(p.value);
  };
  f.addEventListener('focusout', (e) => { if (e.target.tagName === 'INPUT') run(); });
  pop.addEventListener('submit', run, true);
})();

(() => { if (!/[?&]qk=1/.test(location.search)) return; setTimeout(() => { const d = document.getElementById('dashBtn'); if (!d) return; const a = getComputedStyle(d, '::after'); const ss = Array.from(document.querySelectorAll('link[rel=stylesheet],script[src]')).map((n) => (n.href || n.src).split('/').pop()).filter((x) => /style|script/.test(x)).join(' '); const rows = ['files: ' + ss, 'db: ' + (window.db ? 'ok' : 'NULL'), 'class qk: ' + d.classList.contains('qk'), '--qp: ' + d.style.getPropertyValue('--qp'), 'after content: ' + a.content, 'after position: ' + a.position + ' ' + a.width + ' x ' + a.height, 'after bg: ' + String(a.backgroundImage).slice(0, 70), 'after mask: ' + String(a.webkitMaskImage || a.maskImage).slice(0, 40), 'supports conic: ' + CSS.supports('background', 'conic-gradient(red 50%, transparent 0)'), 'supports color-mix: ' + CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'), 'supports mask-composite: ' + (CSS.supports('mask-composite', 'exclude') || CSS.supports('-webkit-mask-composite', 'xor'))]; const o = document.createElement('pre'); o.textContent = rows.join(String.fromCharCode(10)); o.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;margin:0;padding:10px;background:#000;color:#0f0;font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all;border-radius:8px'; o.onclick = () => o.remove(); document.body.appendChild(o); }, 2500); })();
window.qkDeg = (el, k) => { const w = el.offsetWidth, h = el.offsetHeight, P = 2 * (w + h); let s = Math.max(0, Math.min(1, k)) * P, x, y; if (s <= w / 2) { x = s; y = -h / 2; } else if ((s -= w / 2) <= h) { x = w / 2; y = -h / 2 + s; } else if ((s -= h) <= w) { x = w / 2 - s; y = h / 2; } else if ((s -= w) <= h) { x = -w / 2; y = h / 2 - s; } else { s -= h; x = -w / 2 + s; y = -h / 2; } let deg = Math.atan2(x, -y) * 180 / Math.PI; if (deg < 0) deg += 360; if (k >= 1) deg = 360; return deg.toFixed(2) + 'deg'; }; window.qkLeft = (s) => { let seen = 0; try { seen = Number(localStorage.getItem('qk_seen')) || 0; } catch (e) {} const at = Math.max(Date.parse((s.user && s.user.last_sign_in_at) || '') || 0, seen); return 30000 - Math.min(30000, Math.max(0, Date.now() - at)); };
