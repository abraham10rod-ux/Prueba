/* Navegación, utilidades compartidas y animaciones de inicio */
window.FG = (() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = (x, d = 1) => (Number.isFinite(x) ? x : 0).toFixed(d).replace('.', ',');
  const cop = x => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const hooks = [];
  const onRoute = f => hooks.push(f);
  function prep(cv) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1, W = Math.max(1, r.width), H = Math.max(1, r.height);
    if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, W, H };
  }
  function css(v, el) {
    const p = document.createElement('i'); (el || document.body).appendChild(p); p.style.color = `var(${v})`;
    const c = getComputedStyle(p).color; p.remove(); return c;
  }
  const rr = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); };

  /* ---------- rutas ---------- */
  const PAGES = ['inicio', 'pitch', 'teoria', 'simulacion'];
  let cur = '';
  function route() {
    const h = (location.hash || '#inicio').slice(1);
    let page = h, sub = null;
    if (h.startsWith('simulacion')) { page = 'simulacion'; sub = h.split('-')[1] || 'red'; }
    if (!PAGES.includes(page)) page = 'inicio';
    if (page !== cur) { $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + page)); window.scrollTo(0, 0); }
    $$('#mainnav a').forEach(a => a.dataset.r === page ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    if (sub) {
      if (!document.getElementById('t-' + sub)) sub = 'red';
      $$('.spane').forEach(p => p.classList.toggle('on', p.id === 't-' + sub));
      $$('.stabs a').forEach(a => a.dataset.t === sub ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    }
    cur = page;
    $('#mainnav').classList.remove('open'); $('#menu').setAttribute('aria-expanded', 'false');
    hooks.forEach(f => { try { f(page, sub); } catch (e) { console.error(e); } });
  }
  addEventListener('hashchange', route);
  $('#menu').addEventListener('click', () => { const o = $('#mainnav').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(o)); });

  /* ---------- aparición, contadores y anillos ---------- */
  function countUp(el) {
    if (el.dataset.done) return; el.dataset.done = 1;
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), fmt = el.dataset.fmt, t0 = performance.now(), dur = 1500;
    const show = v => el.textContent = fmt === 'cop' ? cop(v) : nf(v, dec);
    if (RM) return show(to);
    const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3; show(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function ring(el) { const C = 2 * Math.PI * 42, f = Math.min(1, +el.dataset.ring / +el.dataset.max); el.style.strokeDasharray = C; el.style.strokeDashoffset = C; requestAnimationFrame(() => requestAnimationFrame(() => el.style.strokeDashoffset = C * (1 - f))); }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; const t = e.target; io.unobserve(t);
    if (t.hasAttribute('data-reveal')) t.classList.add('in');
    if (t.dataset.count) countUp(t);
    if (t.dataset.ring) ring(t);
    t.dispatchEvent(new CustomEvent('reveal'));
  }), { threshold: .15 });
  $$('[data-reveal],[data-count],[data-ring]').forEach(el => io.observe(el));
  $$('[data-ring]').forEach(el => { const C = 2 * Math.PI * 42; el.style.strokeDasharray = C; el.style.strokeDashoffset = C; });

  /* ---------- animación del inicio ---------- */
  const hero = $('#heroCv');
  const NODES = [['Cámara', 'RTSP'], ['Servidor YOLO', 'VLAN 10'], ['Switch 2960', '802.1Q'], ['Router', 'QoS AF41'], ['Cliente VLC', 'VLAN 20']];
  const pk = [];
  let ht = 0, hl = performance.now();
  const PEOPLE = [{ sp: .05, ph: .1, h: .36 }, { sp: -.035, ph: .7, h: .33 }, { sp: .028, ph: .45, h: .3 }];
  function heroDraw(now) {
    const dt = Math.min(.05, (now - hl) / 1000); hl = now; ht += RM ? 0 : dt;
    if (document.getElementById('page-inicio').classList.contains('on')) {
      const { x, W, H } = prep(hero); x.clearRect(0, 0, W, H);
      const fx = W * .06, fy = H * .07, fw = W * .88, fh = H * .56;
      const g = x.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, '#16325c'); g.addColorStop(1, '#0d2244');
      x.fillStyle = g; rr(x, fx, fy, fw, fh, 12); x.fill(); x.strokeStyle = '#2b4f85'; x.lineWidth = 1; x.stroke();
      const gy = fy + fh * .82; x.fillStyle = '#1d3a66'; x.fillRect(fx, gy, fw, fh * .18 - 1);
      x.setLineDash([12, 9]); x.strokeStyle = '#3d5f93'; x.beginPath(); x.moveTo(fx, gy + fh * .09); x.lineTo(fx + fw, gy + fh * .09); x.stroke(); x.setLineDash([]);
      let n = 0; const fs = Math.max(10, W / 56);
      PEOPLE.forEach((p, i) => {
        let u = ((p.ph + p.sp * ht) % 1.3 + 1.3) % 1.3 - .15; const px = fx + u * fw, ph = fh * p.h, pw = ph * .3, py = gy - ph;
        if (px + pw < fx || px > fx + fw - pw) return; n++;
        x.fillStyle = '#8ea6cc'; x.beginPath(); x.arc(px + pw / 2, py + pw * .42, pw * .38, 0, 7); x.fill(); rr(x, px + pw * .12, py + pw * .95, pw * .76, ph - pw * .95, pw * .25); x.fill();
        x.strokeStyle = '#ff9a3d'; x.lineWidth = 2; x.strokeRect(px - 5, py - 5, pw + 10, ph + 8);
        const lb = 'persona 0.' + (88 + i * 3); x.font = `600 ${fs}px "IBM Plex Mono",monospace`; const tw = x.measureText(lb).width + 8;
        x.fillStyle = '#ff9a3d'; x.fillRect(px - 6, py - fs - 10, tw, fs + 6); x.fillStyle = '#fff'; x.fillText(lb, px - 2, py - 9);
      });
      x.font = `600 ${fs * 1.05}px "IBM Plex Mono",monospace`; const tag = `personas: ${n}`;
      x.fillStyle = 'rgba(10,26,51,.85)'; rr(x, fx + 10, fy + 10, x.measureText(tag).width + 18, fs * 2, 6); x.fill(); x.fillStyle = '#fff'; x.fillText(tag, fx + 19, fy + 10 + fs * 1.35);
      x.fillStyle = '#3fd49c'; x.beginPath(); x.arc(fx + fw - 18, fy + 20, 5, 0, 7); x.fill(); x.fillStyle = '#cfe0fb'; x.textAlign = 'right'; x.fillText('YOLOv8n · en vivo', fx + fw - 30, fy + 24); x.textAlign = 'left';
      /* tubería */
      const ly = H * .83, xs = NODES.map((_, i) => W * (.1 + i * .2));
      x.strokeStyle = '#2b4f85'; x.lineWidth = 3; x.beginPath(); x.moveTo(xs[0], ly); x.lineTo(xs[4], ly); x.stroke();
      if (!RM && Math.random() < .5) pk.push({ p: 0, v: .32 + Math.random() * .1, c: Math.random() < .7 ? '#ff9a3d' : '#8ea6cc', s: 0 });
      for (let i = pk.length - 1; i >= 0; i--) { const q = pk[i]; q.p += q.v * dt; if (q.p > 1) { pk.splice(i, 1); continue; }
        x.fillStyle = q.c; x.beginPath(); x.arc(xs[0] + (xs[4] - xs[0]) * q.p, ly + (q.c === '#ff9a3d' ? -5 : 5), 3.5, 0, 7); x.fill(); }
      const bw = Math.min(118, W * .17), bh = Math.max(34, H * .1), nfs = Math.max(10, W / 60);
      NODES.forEach((nd, i) => { x.fillStyle = '#0a1a33'; x.strokeStyle = i === 1 ? '#ff9a3d' : '#3e67a6'; x.lineWidth = 2; rr(x, xs[i] - bw / 2, ly - bh / 2, bw, bh, 8); x.fill(); x.stroke();
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = `600 ${nfs}px "IBM Plex Sans",sans-serif`; x.fillText(nd[0], xs[i], ly - 2);
        x.fillStyle = '#9fb3d6'; x.font = `${nfs * .9}px "IBM Plex Mono",monospace`; x.fillText(nd[1], xs[i], ly + nfs);
      }); x.textAlign = 'left';
      x.strokeStyle = 'rgba(255,154,61,.5)'; x.setLineDash([4, 4]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(xs[1], ly - bh / 2); x.lineTo(xs[1], fy + fh); x.stroke(); x.setLineDash([]);
    }
    requestAnimationFrame(heroDraw);
  }
  requestAnimationFrame(heroDraw);

  /* arranque cuando todo esté cargado */
  addEventListener('DOMContentLoaded', route);
  return { $, $$, nf, cop, prep, css, rr, RM, onRoute, route, countUp };
})();
