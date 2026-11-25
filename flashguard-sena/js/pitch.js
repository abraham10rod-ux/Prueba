/* Pitch: animaciones y elementos interactivos */
(() => {
  const { $, $$, nf, cop, prep, RM, onRoute } = FG;

  /* chips de secciones */
  const secs = $$('#page-pitch [data-chip]');
  $('#pchips').innerHTML = secs.map(s => `<a href="#pitch" data-go="${s.id}">${s.dataset.chip}</a>`).join('');
  $('#pchips').addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.dataset.go).scrollIntoView({ behavior: RM ? 'auto' : 'smooth' }); });
  const cio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $$('#pchips a').forEach(a => a.classList.toggle('act', a.dataset.go === e.target.id)); const a = $(`#pchips a[data-go="${e.target.id}"]`); a && a.scrollIntoView({ block: 'nearest', inline: 'center' }); } }), { rootMargin: '-45% 0px -50% 0px' });
  secs.forEach(s => cio.observe(s));

  /* eslogan escrito */
  let typed = false;
  onRoute(p => { if (p !== 'pitch' || typed) return; typed = true; const el = $('#slogan'), t = el.dataset.text; if (RM) { el.textContent = t; return; } let i = 0; const k = () => { el.textContent = t.slice(0, ++i); if (i < t.length) setTimeout(k, 45); }; setTimeout(k, 400); });

  /* fondo de red del pitch */
  const cv = $('#pitchCv'); const P = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .02, vy: (Math.random() - .5) * .02 }));
  let last = performance.now();
  function bg(t) {
    const dt = Math.min(.05, (t - last) / 1000); last = t;
    if ($('#page-pitch').classList.contains('on') && window.scrollY < 900) {
      const { x, W, H } = prep(cv); x.clearRect(0, 0, W, H);
      for (const p of P) { if (!RM) { p.x += p.vx * dt; p.y += p.vy * dt; } if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; }
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const dx = (P[i].x - P[j].x) * W, dy = (P[i].y - P[j].y) * H, d = Math.hypot(dx, dy);
        if (d < 150) { x.strokeStyle = `rgba(120,160,230,${.35 * (1 - d / 150)})`; x.lineWidth = 1; x.beginPath(); x.moveTo(P[i].x * W, P[i].y * H); x.lineTo(P[j].x * W, P[j].y * H); x.stroke(); }
      }
      P.forEach((p, i) => { x.fillStyle = i % 7 === 0 ? '#ff9a3d' : '#7ea6ea'; x.beginPath(); x.arc(p.x * W, p.y * H, i % 7 === 0 ? 3.5 : 2.2, 0, 7); x.fill(); });
    }
    requestAnimationFrame(bg);
  }
  requestAnimationFrame(bg);

  /* árbol de problemas */
  const wrapT = (s, n) => { const w = s.split(' '), L = []; let l = ''; for (const x of w) { if ((l + ' ' + x).trim().length > n) { L.push(l.trim()); l = x; } else l += ' ' + x; } L.push(l.trim()); return L; };
  const EF = ['Cuadros perdidos en YOLOv8: GOP I/P corruptos que detienen el análisis', 'Latencia superior a 120 ms entre la captura y la alerta', 'Deterioro acelerado de puertos, jacks y patch panels', 'Costos altos de soporte correctivo y pérdida de productividad'];
  const CA = ['Malas prácticas de cableado: sin distancias mínimas, sin canalización y con EMI', 'Red plana sin VLAN: el broadcast ARP y NetBIOS compite con el RTSP', 'Sin QoS: no hay colas prioritarias en el switch ni en el router', 'Componentes fuera de norma: Cat 5e/6 de baja calidad o mal ponchado'];
  const box = (cx, y, w, h, txt, fill, stroke, col, d, n = 28, fs = 14) => {
    const L = wrapT(txt, n), ty = y + h / 2 - (L.length - 1) * (fs * .62);
    return `<g class="bx" style="transition-delay:${d}s"><rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text text-anchor="middle" font-size="${fs}" fill="${col}">${L.map((l, i) => `<tspan x="${cx}" y="${ty + i * fs * 1.25 + fs * .35}">${l}</tspan>`).join('')}</text></g>`;
  };
  let s = `<text x="10" y="16" font-size="13" font-weight="700" fill="var(--bad)">EFECTOS</text><text x="10" y="466" font-size="13" font-weight="700" fill="var(--brand)">CAUSAS</text>`;
  const xs = [130, 377, 623, 870];
  xs.forEach((x, i) => { s += `<path class="ln" d="M${x} 112 C ${x} 160, 500 150, 500 190" style="transition-delay:${1 + i * .1}s"/><path class="ln" d="M${x} 358 C ${x} 320, 500 330, 500 290" style="transition-delay:${.2 + i * .1}s"/>`; });
  xs.forEach((x, i) => s += box(x, 26, 228, 86, EF[i], 'var(--badbg)', 'var(--bad)', 'var(--ink)', 1.3 + i * .15));
  s += box(500, 190, 520, 100, 'Cableado inadecuado y red sin segmentar: latencia excesiva, colisiones y pérdida de paquetes', 'var(--night)', 'var(--vid)', '#fff', .7, 46, 17);
  xs.forEach((x, i) => s += box(x, 358, 228, 90, CA[i], 'var(--brandbg)', 'var(--brand)', 'var(--ink)', i * .15));
  $('#tree').innerHTML = s;

  /* GOP: por qué un 4 % congela el video */
  const NI = 25, NP = 6;
  function gop() {
    const p = +$('#gopLoss').value / 100; $('#gopLossV').textContent = nf(p * 100, 1) + ' %';
    let broken = false, n = 0, html = '';
    for (let k = 0; k < 30; k++) {
      const np = k ? NP : NI; let lost = false; for (let j = 0; j < np; j++) if (Math.random() < p) lost = true;
      const cls = lost ? 'lost' : broken ? 'bad' : ''; if (lost) broken = true; if (cls) n++;
      html += `<i class="${k ? '' : 'I'} ${cls}" title="cuadro ${k} ${k ? 'P' : 'I'}${lost ? ': perdió paquetes' : broken ? ': depende de un cuadro dañado' : ''}">${k ? 'P' : 'I'}</i>`;
    }
    $('#gop').innerHTML = html;
    let E = 0; for (let k = 0; k < 30; k++) E += 1 - (1 - p) ** (NI + NP * k);
    $('#gopP').textContent = nf((1 - (1 - p) ** NP) * 100, 1) + ' %'; $('#gopN').textContent = `${n} de 30`; $('#gopE').textContent = nf(E, 1) + ' de 30';
  }
  $('#gopLoss').addEventListener('input', gop); $('#gopRoll').addEventListener('click', gop); gop();

  /* competencia */
  const COMP = [['Doctor Computadores', 'Chapinero', 1, 1, 1, 0], ['SONDA', 'Centro empresarial', 0, 1, 1, 0], ['SATIC', 'Bavaria, Chapinero', 1, 1, 1, 0], ['SERO', 'Bogotá', 1, 1, 1, 0], ['Flash Guard', 'Fontibón, D.C.', 1, 1, 1, 1]];
  $('#compTbl tbody').innerHTML = COMP.map((r, i) => `<tr class="${i === 4 ? 'us' : ''}"><td>${r[0]}</td><td>${r[1]}</td>${r.slice(2).map((v, j) => `<td><span class="${v ? 'yes' : 'no'}" style="transition-delay:${(i * 4 + j) * .05}s" aria-label="${v ? 'Sí' : 'No'}">${v ? '✓' : '✕'}</span>${i === 4 && j >= 2 ? (j === 2 ? ' certificado' : ' YOLOv8 + QoS') : ''}</td>`).join('')}</tr>`).join('');

  /* barras de la matriz técnica */
  const M = { lat: { u: ' ms', v: [118, 22, 8], d: 0 }, loss: { u: ' %', v: [4.2, .15, 0], d: 2 } }, LB = ['Red plana', 'VLAN aislada', 'VLAN + QoS'], CL = ['var(--bad)', 'var(--warn)', 'var(--ok)'];
  $('#hbars').innerHTML = LB.map((l, i) => `<div class="hb"><span>${l}</span><div class="t"><i style="background:${CL[i]}"></i></div><b></b></div>`).join('');
  let metric = 'lat', shown = false;
  function bars() { const m = M[metric], mx = Math.max(...m.v); $$('#hbars .hb').forEach((r, i) => { r.querySelector('i').style.width = shown ? Math.max(1, m.v[i] / mx * 100) + '%' : '0'; r.querySelector('b').textContent = nf(m.v[i], m.d) + m.u; }); }
  $('#hbars').closest('[data-reveal]').addEventListener('reveal', () => { shown = true; setTimeout(bars, 200); });
  $$('[data-metric]').forEach(b => b.addEventListener('click', () => { metric = b.dataset.metric; $$('[data-metric]').forEach(x => { x.classList.toggle('on', x === b); x.classList.toggle('ghost', x !== b); }); bars(); }));
  bars();

  /* dona del presupuesto */
  const B = [['Materiales e insumos', 143500, 'var(--brand)'], ['Herramientas propias', 108900, 'var(--vid)'], ['Cofinanciado (taladro)', 106000, 'var(--ok)']], T = B.reduce((a, b) => a + b[1], 0), R = 80, C = 2 * Math.PI * R;
  let off = 0, d = `<circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--panel2)" stroke-width="30"/>`;
  B.forEach((b, i) => { const L = b[1] / T * C; d += `<circle class="seg" cx="110" cy="110" r="${R}" fill="none" stroke="${b[2]}" stroke-width="30" stroke-dashoffset="${-off}" transform="rotate(-90 110 110)" data-l="${L - 2}" style="stroke-dasharray:0 ${C};transition:stroke-dasharray 1s ${i * .35}s ease"/>`; off += L; });
  d += `<text x="110" y="104" text-anchor="middle" font-size="13" fill="var(--muted)">Total</text><text x="110" y="128" text-anchor="middle" font-size="20" font-weight="700" fill="var(--ink)" style="font-family:'IBM Plex Mono',monospace">$${cop(T)}</text>`;
  $('#donut').innerHTML = d;
  $('#donutLeg').innerHTML = B.map(b => `<div><i style="background:${b[2]}"></i><span>${b[0]}</span><b>$${cop(b[1])} · ${nf(b[1] / T * 100, 0)} %</b></div>`).join('');
  $('#donut').closest('[data-reveal]').addEventListener('reveal', () => $$('#donut .seg').forEach(c => c.style.strokeDasharray = `${c.dataset.l} ${C}`));
})();
