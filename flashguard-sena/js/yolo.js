/* Servidor y YOLOv8 por dentro: tubería, rejillas, umbral y NMS real */
(() => {
  const { $, $$, nf, prep, css, rr, onRoute, RM } = FG;
  const cv = $('#yCv');
  const hash = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  /* escena (coordenadas normalizadas sobre 1280×720) */
  const OBJ = [{ c: 'persona', sp: .05, ph: .15, w: .05, h: .38, dir: 1, sp2: 1.35, cf: .91 }, { c: 'persona', sp: .038, ph: .8, w: .05, h: .34, dir: -1, sp2: 1.35, cf: .86 },
    { c: 'persona', sp: .026, ph: .42, w: .044, h: .3, dir: 1, sp2: 2.2, cf: .79 }, { c: 'auto', sp: .1, ph: .5, w: .2, h: .2, dir: -1, sp2: 1.9, cf: .9 }, { c: 'perro', sp: .07, ph: .2, w: .09, h: .11, dir: 1, sp2: 1.6, cf: .74 }];
  function scene(t) { return OBJ.map((o, i) => { const u = ((o.ph + o.sp * t) % o.sp2) - .2, x = o.dir > 0 ? u : 1 - o.w - u; return { ...o, i, x, y: .84 - o.h }; }).filter(o => o.x > -.02 && o.x + o.w < 1.02); }
  function drawScene(x, X, Y, W, H, t, dim) {
    x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
    const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, '#2a3f63'); g.addColorStop(1, '#3b4f70'); x.fillStyle = g; x.fillRect(X, Y, W, H);
    x.fillStyle = '#4a5d7e'; for (let i = 0; i < 6; i++) x.fillRect(X + W * (.05 + i * .17), Y + H * .18, W * .11, H * .5);
    x.fillStyle = '#56688a'; x.fillRect(X, Y + H * .84, W, H * .16); x.strokeStyle = '#8fa1c0'; x.setLineDash([W / 40, W / 60]); x.lineWidth = 2; x.beginPath(); x.moveTo(X, Y + H * .92); x.lineTo(X + W, Y + H * .92); x.stroke(); x.setLineDash([]);
    for (const o of scene(t)) { const px = X + o.x * W, py = Y + o.y * H, w = o.w * W, h = o.h * H; x.fillStyle = '#c9d3e4';
      if (o.c === 'persona') { x.beginPath(); x.arc(px + w / 2, py + w * .45, w * .42, 0, 7); x.fill(); rr(x, px + w * .1, py + w, w * .8, h - w, w * .25); x.fill(); }
      else if (o.c === 'auto') { rr(x, px, py + h * .35, w, h * .5, 8); x.fill(); rr(x, px + w * .2, py, w * .55, h * .45, 10); x.fill(); x.fillStyle = '#1a2538'; for (const q of [.22, .78]) { x.beginPath(); x.arc(px + w * q, py + h * .86, h * .15, 0, 7); x.fill(); } }
      else { x.beginPath(); x.ellipse(px + w * .45, py + h * .6, w * .4, h * .3, 0, 0, 7); x.fill(); x.beginPath(); x.arc(px + w * .85, py + h * .3, h * .22, 0, 7); x.fill(); } }
    if (dim) { x.fillStyle = 'rgba(8,18,31,.45)'; x.fillRect(X, Y, W, H); }
    x.restore();
  }
  /* ---------- candidatas y NMS ---------- */
  const SC = [80, 40, 20], CLS = { persona: 0, auto: 2, perro: 16 };
  function candidates(f) {
    const C = []; let r = f.no * 1000;
    const R = () => hash(++r);
    for (const o of scene(f.t)) {
      const bx = o.x * 640, by = o.y * 360 + 140, bw = o.w * 640, bh = o.h * 360, cx = bx + bw / 2, cy = by + bh / 2, sz = Math.max(bw, bh);
      const best = sz < 64 ? 80 : sz < 170 ? 40 : 20;
      for (const s of SC) {
        const st = 640 / s, gx = Math.floor(cx / st), gy = Math.floor(cy / st), rad = s === best ? 1 : 0, f2 = s === best ? 1 : .5;
        for (let dx = -rad; dx <= rad; dx++) for (let dy = -rad; dy <= rad; dy++) {
          const d2 = dx * dx + dy * dy, sc = o.cf * Math.exp(-d2 / 1.4) * f2 * (.9 + R() * .15);
          const j = (1 - sc) * .14; const w = bw * (1 + (R() - .5) * j), h = bh * (1 + (R() - .5) * j), ccx = cx + (R() - .5) * j * bw, ccy = cy + (R() - .5) * j * bh;
          C.push({ x1: ccx - w / 2, y1: ccy - h / 2, x2: ccx + w / 2, y2: ccy + h / 2, s: Math.min(.97, sc), c: o.c, sc: s, gx: gx + dx, gy: gy + dy });
        }
      }
    }
    for (let i = 0; i < 70; i++) { const w = 20 + R() * 120, h = 20 + R() * 150, x = R() * 600, y = 140 + R() * 330; C.push({ x1: x, y1: y, x2: x + w, y2: y + h, s: .005 + R() ** 4 * .21, c: R() < .6 ? 'persona' : 'silla', sc: SC[Math.floor(R() * 3)] }); }
    return C.sort((a, b) => b.s - a.s);
  }
  const iou = (a, b) => { const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)), i = w * h; return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i); };
  function nmsTrace(C, conf, thr) { const L = C.filter(c => c.s >= conf), keep = [], ev = [], dead = new Set(); for (let i = 0; i < L.length; i++) { if (dead.has(i)) continue; keep.push(L[i]); const sup = []; for (let j = i + 1; j < L.length; j++) if (!dead.has(j) && L[j].c === L[i].c && iou(L[i], L[j]) > thr) { dead.add(j); sup.push(L[j]); } ev.push({ k: L[i], sup }); } return { L, keep, ev }; }

  /* ---------- etapas ---------- */
  const ST = [
    ['Captura', 'OpenCV lee un cuadro de 1280×720 de la cámara con cv2.VideoCapture. A 30 FPS llega uno nuevo cada 33 ms.'],
    ['Letterbox 640', 'Se escala el lado mayor a 640 (×0,5 → 640×360) y se rellena con gris (114) hasta 640×640 sin deformar. En modo predict, Ultralytics rellena solo hasta un múltiplo de 32 (640×384).'],
    ['Tensor', 'BGR → RGB, HWC → CHW y división por 255. Entra a la red un tensor float32 de 1×3×640×640.'],
    ['Backbone CSPDarknet', 'Convoluciones con bloques C2f y SPPF reducen la imagen ×8, ×16 y ×32. Salen los mapas P3 (80×80×64), P4 (40×40×128) y P5 (20×20×256).'],
    ['Neck PAN-FPN', 'Combina los mapas de arriba abajo (contexto) y de abajo arriba (detalle) para detectar objetos pequeños y grandes.'],
    ['Cabeza sin anclas', 'Cada celda de las tres rejillas predice 4 distancias de la caja (DFL, 16 valores por lado) y 80 probabilidades de clase. 80² + 40² + 20² = 8400 predicciones.'],
    ['8400 predicciones', 'La salida es 1×84×8400: 4 coordenadas + 80 clases. Se dibujan las que superan 0,01; casi todas son fondo.'],
    ['Umbral de confianza', 'Se descartan las predicciones con confianza menor al umbral (conf=0,25 por defecto en Ultralytics).'],
    ['NMS', 'Supresión de no máximos: se toma la caja de mayor confianza, se eliminan las de su misma clase con IoU mayor al umbral, y se repite.'],
    ['Resultado', 'Las cajas vuelven a la escala original (restar relleno y dividir por 0,5). Se cuentan las personas para las alertas.'],
    ['Anotar y codificar', 'r.plot() dibuja cajas y etiquetas. H.264 divide el cuadro en macrobloques de 16×16 y en un cuadro P solo codifica los que cambiaron.'],
    ['Empaquetar y enviar', 'El cuadro comprimido se divide en paquetes RTP de 1400 B que pasan a UDP, IP y Ethernet y salen por la NIC hacia Fa0/1.'],
  ];
  const DUR = [2200, 2400, 2000, 2800, 2400, 2800, 2400, 2400, 0, 2600, 2800, 2600];
  $('#yStages').innerHTML = ST.map((s, i) => `<button type="button" data-i="${i}"><i>${i + 1}</i><span>${s[0]}</span></button>`).join('');
  let stg = 0, t0 = performance.now(), playing = !RM, frame = null, fno = 0, simT = 3, cand = [], trace = null, visible = false, nmsK = 0, nmsT = 0;
  function newFrame() { fno++; simT += 1.7; frame = { no: fno, t: simT, I: fno % 4 === 1 }; cand = candidates(frame); retrace(); }
  function retrace() { trace = nmsTrace(cand, +$('#yConf').value, +$('#yIou').value); }
  function setStage(i) { stg = (i + ST.length) % ST.length; if (stg === 0 && i >= ST.length) newFrame(); t0 = performance.now(); nmsK = 0; nmsT = t0; ui(); }
  function ui() {
    $$('#yStages button').forEach((b, i) => { b.classList.toggle('on', i === stg); b.classList.toggle('done', i < stg); });
    const persons = trace.keep.filter(k => k.c === 'persona').length, above = trace.L.length, over01 = cand.filter(c => c.s > .01).length;
    const [w, h] = [1280, 720], bytes = frame.I ? 34000 : 8200, pk = Math.ceil(bytes / 1400);
    const N = [[['Resolución', '1280×720'], ['Tamaño', '2,64 MB'], ['Formato', 'BGR uint8']], [['Escala', '× 0,5'], ['Relleno', '140 px arriba y abajo'], ['Entrada', '640×640']], [['Forma', '1×3×640×640'], ['Tipo', 'float32'], ['Tamaño', '4,9 MB']],
      [['P3 · ×8', '80×80×64'], ['P4 · ×16', '40×40×128'], ['P5 · ×32', '20×20×256']], [['Escalas', '3'], ['Parámetros', '3,2 M'], ['Cómputo', '8,7 GFLOPs']], [['P3', '6400'], ['P4', '1600'], ['P5', '400']],
      [['Predicciones', '8400'], ['> 0,01', String(over01)], ['Forma', '1×84×8400']], [['Umbral', nf(+$('#yConf').value, 2)], ['Sobreviven', String(above)], ['Descartadas', String(8400 - above)]],
      [['Entran', String(above)], ['Quedan', String(trace.keep.length)], ['IoU', nf(+$('#yIou').value, 2)]], [['Personas', String(persons)], ['Objetos', String(trace.keep.length)], ['Post-proceso', '≈ 1,5 ms']],
      [['Tipo de cuadro', frame.I ? 'I (completo)' : 'P (cambios)'], ['Macrobloques', '3600'], ['Comprimido', nf(bytes / 1024, 1) + ' KB']], [['Paquetes RTP', String(pk)], ['Bytes en el cable', String(bytes + pk * 58)], ['A 100 Mbps', nf((bytes + pk * 78) * 8 / 1e5, 2) + ' ms']]][stg];
    $('#yInfo').innerHTML = `<h3>${stg + 1}. ${ST[stg][0]}</h3><p class="muted" style="margin:0">${ST[stg][1]}</p><div class="ynum">${N.map(n => `<div><span>${n[0]}</span><b>${n[1]}</b></div>`).join('')}</div>`;
  }
  /* geometría del letterbox en el canvas */
  function lb(W, H) { const S = Math.min(W, H) * .92, X = (W - S) / 2, Y = (H - S) / 2; return { X, Y, S, k: S / 640 }; }
  const HC = new Map();
  function heat(x, X, Y, S, s, f) {
    const key = f.no + '-' + s; let c = HC.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'), im = g.createImageData(s, s);
      const objs = scene(f.t).map(o => ({ cx: (o.x + o.w / 2) * 640, cy: (o.y + o.h / 2) * 360 + 140, r: Math.max(o.w * 640, o.h * 360) }));
      for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { const px = (i + .5) * 640 / s, py = (j + .5) * 640 / s; let v = .04 + hash(i * 31 + j * 7 + s) * .08;
        for (const o of objs) { const sig = s === 80 ? o.r * .25 : s === 40 ? o.r * .4 : o.r * .6; v += Math.exp(-((px - o.cx) ** 2 + (py - o.cy) ** 2) / (2 * sig * sig)) * (s === 20 ? (o.r > 150 ? 1 : .4) : s === 80 ? (o.r < 90 ? 1 : .5) : .8); }
        v = Math.min(1, v); const p = (j * s + i) * 4; im.data[p] = 40 + v * 215; im.data[p + 1] = 60 + v * 120 * (1 - v) + v * 40; im.data[p + 2] = 140 - v * 120; im.data[p + 3] = 255; }
      g.putImageData(im, 0, 0); HC.set(key, c); if (HC.size > 12) HC.delete(HC.keys().next().value);
    }
    x.imageSmoothingEnabled = false; x.drawImage(c, X, Y, S, S); x.imageSmoothingEnabled = true;
  }
  function draw(now) {
    if (!visible) return; const { x, W, H } = prep(cv); x.clearRect(0, 0, W, H); x.fillStyle = '#0b1424'; x.fillRect(0, 0, W, H);
    const e = Math.min(1, (now - t0) / 900), ease = 1 - (1 - e) ** 3, fs = Math.max(11, W / 60), f = frame, L = lb(W, H);
    const mono = (t, a, b, c = '#cfe0fb', al = 'left') => { x.fillStyle = c; x.font = `600 ${fs}px "IBM Plex Mono",monospace`; x.textAlign = al; x.fillText(t, a, b); x.textAlign = 'left'; };
    const full = () => { const fw = Math.min(W * .94, H * .94 * 16 / 9), fh = fw * 9 / 16; return { X: (W - fw) / 2, Y: (H - fh) / 2, W: fw, H: fh }; };
    const lbImg = (dim) => { x.fillStyle = '#727272'; x.fillRect(L.X, L.Y, L.S, L.S); drawScene(x, L.X, L.Y + 140 * L.k, L.S, 360 * L.k, f.t, dim); };
    const box = (b, col, lw = 2, a = 1, lbl) => { x.globalAlpha = a; x.strokeStyle = col; x.lineWidth = lw; x.strokeRect(L.X + b.x1 * L.k, L.Y + b.y1 * L.k, (b.x2 - b.x1) * L.k, (b.y2 - b.y1) * L.k); if (lbl) { x.font = `600 ${fs * .85}px "IBM Plex Mono",monospace`; const tw = x.measureText(lbl).width + 8; x.fillStyle = col; x.fillRect(L.X + b.x1 * L.k - 1, L.Y + b.y1 * L.k - fs - 4, tw, fs + 4); x.fillStyle = '#fff'; x.fillText(lbl, L.X + b.x1 * L.k + 3, L.Y + b.y1 * L.k - 5); } x.globalAlpha = 1; };
    if (stg === 0) { const F = full(); drawScene(x, F.X, F.Y, F.W, F.H, f.t); mono('cv2.VideoCapture · cuadro ' + f.no, F.X + 10, F.Y + fs + 8); mono('1280 × 720', F.X + F.W - 10, F.Y + F.H - 10, '#ffb366', 'right'); }
    else if (stg === 1) { const F = full(); const X = F.X + (L.X - F.X) * ease, Y = F.Y + (L.Y + 140 * L.k - F.Y) * ease, w = F.W + (L.S - F.W) * ease, h = F.H + (360 * L.k - F.H) * ease;
      x.globalAlpha = ease; x.fillStyle = '#727272'; x.fillRect(L.X, L.Y, L.S, L.S); x.globalAlpha = 1; drawScene(x, X, Y, w, h, f.t);
      if (e >= 1) { x.strokeStyle = '#ffb366'; x.setLineDash([6, 4]); x.strokeRect(L.X, L.Y, L.S, L.S); x.setLineDash([]); mono('640 × 640', L.X + L.S / 2, L.Y - 8, '#ffb366', 'center'); mono('relleno 140 px · gris 114', L.X + 8, L.Y + 140 * L.k / 2 + 4, '#fff'); mono('640 × 360', L.X + L.S / 2, L.Y + L.S / 2 + 4, '#fff', 'center'); } }
    else if (stg === 2) { const cols = [['#ff5a5a', 'R'], ['#4ade80', 'G'], ['#60a5fa', 'B']], S = L.S * .72, off = S * .12;
      cols.forEach((c, i) => { const X = L.X + L.S * .06 + i * off * ease * 1.4, Y = L.Y + L.S * .06 + i * off * ease; x.fillStyle = '#727272'; x.fillRect(X, Y, S, S); drawScene(x, X, Y + S * 140 / 640, S, S * 360 / 640, f.t); x.globalCompositeOperation = 'multiply'; x.fillStyle = c[0]; x.fillRect(X, Y, S, S); x.globalCompositeOperation = 'source-over'; x.strokeStyle = '#fff'; x.strokeRect(X, Y, S, S); mono(c[1], X + 8, Y + fs + 6, '#fff'); });
      mono('tensor 1×3×640×640 · float32 · valores 0–1', W / 2, H - 12, '#ffb366', 'center'); }
    else if (stg === 3) { const B = [[320, 16, 'Conv ×2'], [160, 32, 'C2f ×4'], [80, 64, 'P3 · C2f ×8'], [40, 128, 'P4 · C2f ×16'], [20, 256, 'P5 · SPPF ×32']], base = H * .62;
      let X = W * .05; const tot = W * .9, unit = Math.min((tot - B.length * 44) / B.reduce((a, b) => a + Math.sqrt(b[0]) * 1.1, 0), H * .5 / (Math.sqrt(320) * 1.1)), pulse = ((now - t0) / 1800) % 1;
      B.forEach((b, i) => { const s = Math.sqrt(b[0]) * unit * 1.1, d = Math.min(46, b[1] / 5), y = base - s / 2; const act = Math.abs(pulse * 5 - i - .5) < .6;
        x.fillStyle = act ? '#ff9a3d' : '#29446f'; x.beginPath(); x.moveTo(X, y); x.lineTo(X + d * .6, y - d * .5); x.lineTo(X + s + d * .6, y - d * .5); x.lineTo(X + s, y); x.fill();
        x.fillStyle = act ? '#c46a1c' : '#1d3456'; x.beginPath(); x.moveTo(X + s, y); x.lineTo(X + s + d * .6, y - d * .5); x.lineTo(X + s + d * .6, y + s - d * .5); x.lineTo(X + s, y + s); x.fill();
        if (i >= 2) heat(x, X, y, s, b[0] === 80 ? 80 : b[0] === 40 ? 40 : 20, f, 1); else { x.fillStyle = '#727272'; x.fillRect(X, y, s, s); drawScene(x, X, y + s * 140 / 640, s, s * 360 / 640, f.t, true); }
        x.strokeStyle = act ? '#ffb366' : '#5578b0'; x.lineWidth = 1.5; x.strokeRect(X, y, s, s);
        mono(b[0] + '×' + b[0], X + s / 2, base + Math.max(s / 2, 30) + 18, '#fff', 'center'); x.font = `${fs * .85}px "IBM Plex Mono",monospace`; x.fillStyle = '#9fb3d6'; x.textAlign = 'center'; x.fillText(b[1] + ' canales', X + s / 2, base + Math.max(s / 2, 30) + 18 + fs + 2); x.fillText(b[2], X + s / 2, y - d - 6); x.textAlign = 'left';
        X += s + d * .6 + 14; });
      mono('Mapas de activación ilustrativos: más cálido = más evidencia de objeto', W / 2, 22, '#cfe0fb', 'center'); }
    else if (stg === 4) { const S = Math.min(H * .26, W * .2), xs = [W * .2, W * .5, W * .8], R = [80, 40, 20], lbs = ['P3 · 80×80', 'P4 · 40×40', 'P5 · 20×20'], y = H * .5 - S / 2;
      R.forEach((r, i) => { heat(x, xs[i] - S / 2, y, S, r, f, 1); x.strokeStyle = '#5578b0'; x.strokeRect(xs[i] - S / 2, y, S, S); mono(lbs[i], xs[i], y + S + 22, '#fff', 'center'); });
      const dash = -((now - t0) / 30) % 20; x.setLineDash([8, 6]); x.lineDashOffset = dash; x.lineWidth = 3;
      x.strokeStyle = '#60a5fa'; for (let i = 2; i > 0; i--) { x.beginPath(); x.moveTo(xs[i] - S / 2 - 6, y + S * .3); x.lineTo(xs[i - 1] + S / 2 + 6, y + S * .3); x.stroke(); }
      x.strokeStyle = '#ff9a3d'; for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(xs[i] + S / 2 + 6, y + S * .7); x.lineTo(xs[i + 1] - S / 2 - 6, y + S * .7); x.stroke(); }
      x.setLineDash([]); mono('← de arriba abajo (FPN): contexto', W / 2, y - 20, '#60a5fa', 'center'); mono('de abajo arriba (PAN): detalle →', W / 2, y + S + 52, '#ff9a3d', 'center'); }
    else if (stg >= 5 && stg <= 8) {
      lbImg(stg >= 6);
      if (stg === 5) { const s = +$('#yScale').value, st = L.S / s; x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 1; x.beginPath(); for (let i = 0; i <= s; i++) { x.moveTo(L.X + i * st, L.Y); x.lineTo(L.X + i * st, L.Y + L.S); x.moveTo(L.X, L.Y + i * st); x.lineTo(L.X + L.S, L.Y + i * st); } x.stroke();
        const cells = cand.filter(c => c.sc === s && c.gx !== undefined && c.s > .3); x.fillStyle = 'rgba(255,154,61,.55)'; cells.forEach(c => x.fillRect(L.X + c.gx * st, L.Y + c.gy * st, st, st));
        mono(`rejilla ${s}×${s} · celda de ${640 / s} px · ${s * s} predicciones`, L.X + L.S / 2, L.Y - 8, '#ffb366', 'center'); }
      if (stg === 6) { cand.filter(c => c.s > .01).forEach(c => box(c, c.c === 'persona' ? '#ff9a3d' : '#60a5fa', 1.2, Math.min(1, .15 + c.s))); mono(`${cand.filter(c => c.s > .01).length} de 8400 predicciones con conf > 0,01`, L.X + L.S / 2, L.Y - 8, '#ffb366', 'center'); }
      if (stg === 7) { const cf = +$('#yConf').value; cand.forEach(c => { if (c.s >= cf) box(c, c.c === 'persona' ? '#ff9a3d' : '#60a5fa', 2, 1); else if (c.s > .01) { x.setLineDash([3, 3]); box(c, '#8090a8', 1, .3); x.setLineDash([]); } }); mono(`conf ≥ ${nf(cf, 2)}: quedan ${trace.L.length}`, L.X + L.S / 2, L.Y - 8, '#ffb366', 'center'); }
      if (stg === 8) { const ev = trace.ev; if (!RM && playing && now - nmsT > 650 && nmsK < ev.length) { nmsK++; nmsT = now; } if (RM || !playing && nmsK === 0) nmsK = ev.length;
        const done = new Set(), gone = new Set(); ev.slice(0, nmsK).forEach(v => { done.add(v.k); v.sup.forEach(s => gone.add(s)); });
        trace.L.forEach(c => { if (!done.has(c) && !gone.has(c)) box(c, '#8090a8', 1.2, .6); });
        gone.forEach(c => { box(c, '#ff5a5a', 1.2, .35); });
        const cur = ev[nmsK - 1]; done.forEach(c => box(c, '#3fd49c', c === (cur && cur.k) ? 4 : 2.5, 1, `${c.c} ${c.s.toFixed(2)}`));
        if (cur) cur.sup.forEach(s => { x.strokeStyle = '#ff5a5a'; x.lineWidth = 2; const a = L.X + s.x1 * L.k, b = L.Y + s.y1 * L.k, c = L.X + s.x2 * L.k, d = L.Y + s.y2 * L.k; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.moveTo(c, b); x.lineTo(a, d); x.stroke(); });
        mono(nmsK < ev.length ? `iteración ${nmsK} de ${ev.length}: se conserva la caja verde y se borran ${cur ? cur.sup.length : 0} con IoU > ${nf(+$('#yIou').value, 2)}` : `NMS terminó: ${trace.keep.length} cajas finales`, L.X + L.S / 2, L.Y - 8, '#ffb366', 'center');
        if (nmsK >= ev.length && playing && now - nmsT > 1800) setStage(stg + 1);
      }
    }
    else if (stg === 9 || stg === 10) { const F = full(); drawScene(x, F.X, F.Y, F.W, F.H, f.t); const k = F.W / 640;
      trace.keep.forEach(b => { const X = F.X + b.x1 * k, Y = F.Y + (b.y1 - 140) * k, w = (b.x2 - b.x1) * k, h = (b.y2 - b.y1) * k, col = b.c === 'persona' ? '#ff9a3d' : '#60a5fa'; x.strokeStyle = col; x.lineWidth = 2.5; x.strokeRect(X, Y, w, h); const lbl = `${b.c} ${b.s.toFixed(2)}`; x.font = `600 ${fs * .9}px "IBM Plex Mono",monospace`; const tw = x.measureText(lbl).width + 8; x.fillStyle = col; x.fillRect(X - 1, Y - fs - 5, tw, fs + 5); x.fillStyle = '#fff'; x.fillText(lbl, X + 3, Y - 5); });
      const per = trace.keep.filter(b => b.c === 'persona').length; x.fillStyle = 'rgba(10,26,51,.85)'; rr(x, F.X + 10, F.Y + 10, fs * 9, fs * 2, 6); x.fill(); mono(`personas: ${per}`, F.X + 20, F.Y + 10 + fs * 1.35, '#fff');
      if (stg === 10) { const mb = F.W / 80; x.lineWidth = 1; const prev = scene(f.t - 1 / 30), curS = scene(f.t), ch = (bx, by) => frame.I || [...prev, ...curS].some(o => bx + 1 > o.x * 80 && bx < (o.x + o.w) * 80 + 1 && by + 1 > o.y * 45 && by < (o.y + o.h) * 45 + 1) || trace.keep.some(b => { const X = b.x1 / 8, X2 = b.x2 / 8, Y = (b.y1 - 140) / 8, Y2 = (b.y2 - 140) / 8; return bx + 1 > X && bx < X2 + 1 && by + 1 > Y - 2 && by < Y2 + 1; });
        let n = 0; const sw = Math.floor(e * 80); for (let i = 0; i < 80; i++) for (let j = 0; j < 45; j++) { if (i > sw) continue; if (ch(i, j)) { n++; x.fillStyle = 'rgba(255,154,61,.35)'; x.fillRect(F.X + i * mb, F.Y + j * mb, mb, mb); } }
        x.strokeStyle = 'rgba(255,255,255,.08)'; x.beginPath(); for (let i = 0; i <= 80; i++) { x.moveTo(F.X + i * mb, F.Y); x.lineTo(F.X + i * mb, F.Y + F.H); } for (let j = 0; j <= 45; j++) { x.moveTo(F.X, F.Y + j * mb); x.lineTo(F.X + F.W, F.Y + j * mb); } x.stroke();
        mono(frame.I ? 'cuadro I: se codifican los 3600 macrobloques' : `cuadro P: ${n} de 3600 macrobloques cambiaron`, F.X + F.W - 10, F.Y + F.H - 10, '#ffb366', 'right'); } }
    else if (stg === 11) { const bytes = frame.I ? 34000 : 8200, n = Math.ceil(bytes / 1400), F = full(), s = Math.max(.35, 1 - ease * .65), w = F.W * s * .5, h = w * 9 / 16;
      drawScene(x, W * .08, H / 2 - h / 2, w, h, f.t); x.strokeStyle = '#ff9a3d'; x.strokeRect(W * .08, H / 2 - h / 2, w, h);
      const sx = W * .08 + w + 20, ex = W * .92, pw = Math.min(26, (ex - sx) / (n + 2)), prog = ((now - t0) / 2200);
      for (let i = 0; i < n; i++) { const p = Math.min(1, Math.max(0, prog * 1.6 - i / n * .6)); const X = sx + (ex - sx - pw) * p, Y = H / 2 - 10 + (i % 3 - 1) * 26; x.fillStyle = p >= 1 ? '#3fd49c' : '#ff9a3d'; rr(x, X, Y, pw * .9, 20, 4); x.fill(); }
      x.fillStyle = '#29446f'; rr(x, ex - 6, H / 2 - 60, 14, 120, 4); x.fill(); mono('NIC → Fa0/1', ex - 4, H / 2 + 80, '#cfe0fb', 'center');
      mono(`${n} paquetes RTP de hasta 1400 B (+58 B de cabeceras)`, W / 2, 26, '#ffb366', 'center'); }
    if (playing && stg !== 8 && DUR[stg] && now - t0 > DUR[stg]) setStage(stg + 1);
  }
  /* ---------- línea de tiempo y recursos ---------- */
  const G = { t: 0, busy: 0, rows: [], last: 0, skip: 0, done: 0, hist: [] };
  function gStep(dt) { const slow = .1; G.t += dt * slow; const cpu = $('#yHw').value === 'cpu';
    while (G.last + 1 / 30 <= G.t) { G.last += 1 / 30; const c = G.last; const inf = (cpu ? 46 + (hash(c * 97) - .5) * 14 : 9 + (hash(c * 97) - .5) * 3) / 1000;
      if (G.busy > c + .005) { G.rows.push({ c, skip: true }); G.skip++; } else { const s = Math.max(c, G.busy), pre = .003, post = .0015, plot = .002, enc = .008; G.busy = s + pre + inf; G.rows.push({ c, s, seg: [['pre', pre], ['inf', inf], ['post', post], ['plot', plot], ['enc', enc], ['tx', .0012]] }); G.done++; }
      G.hist.push({ t: c, ok: !G.rows[G.rows.length - 1].skip }); }
    G.rows = G.rows.filter(r => r.c > G.t - .5); G.hist = G.hist.filter(h => h.t > G.t - 1); }
  const SEGC = { pre: '#60a5fa', inf: '#ff9a3d', post: '#c084fc', plot: '#f472b6', enc: '#3fd49c', tx: '#facc15' }, SEGN = { pre: 'preproceso', inf: 'inferencia', post: 'NMS', plot: 'dibujo', enc: 'H.264', tx: 'envío' };
  function gantt() { const { x, W, H } = prep($('#yGantt')); x.clearRect(0, 0, W, H); const ink = css('--muted'), l = 54, r = 8, T = .35, X = t => l + (t - (G.t - T)) / T * (W - l - r), rows = G.rows.slice(-12), rh = (H - 40) / 12;
    x.font = '11px "IBM Plex Mono",monospace'; x.fillStyle = ink;
    rows.forEach((row, i) => { const y = 4 + i * rh; x.fillStyle = ink; x.fillText('#' + Math.round(row.c * 30) % 1000, 4, y + rh * .7);
      x.fillStyle = css('--line'); x.fillRect(X(row.c), y + 2, 2, rh - 4);
      if (row.skip) { x.save(); x.strokeStyle = css('--bad'); x.lineWidth = 1; for (let k = 0; k < 6; k++) { x.beginPath(); x.moveTo(X(row.c) + k * 6, y + rh - 3); x.lineTo(X(row.c) + k * 6 + 6, y + 3); x.stroke(); } x.restore(); x.fillStyle = css('--bad'); x.fillText('descartado', X(row.c) + 40, y + rh * .7); return; }
      let t = row.s; if (t > row.c) { x.fillStyle = css('--line'); x.fillRect(X(row.c), y + rh * .45, X(t) - X(row.c), 2); }
      row.seg.forEach(([k, d]) => { x.fillStyle = SEGC[k]; x.fillRect(X(t), y + 3, Math.max(1, X(t + d) - X(t)), rh - 6); t += d; }); });
    let lx = l; Object.keys(SEGC).forEach(k => { x.fillStyle = SEGC[k]; x.fillRect(lx, H - 16, 10, 10); x.fillStyle = ink; x.fillText(SEGN[k], lx + 14, H - 7); lx += x.measureText(SEGN[k]).width + 30; });
    x.fillStyle = ink; x.textAlign = 'right'; x.fillText('cámara lenta ×0,1', W - 6, H - 24); x.textAlign = 'left'; }
  function meters() { const cpu = $('#yHw').value === 'cpu', fps = G.hist.length ? Math.round(30 * G.hist.filter(h => h.ok).length / G.hist.length) : 0, wob = Math.sin(performance.now() / 700) * 3;
    const M = [['CPU (4 núcleos)', cpu ? 78 + wob : 24 + wob, '%'], ['GPU', cpu ? 0 : 55 + wob, '%'], ['Memoria', cpu ? 61 : 48, '%'], ['FPS efectivos', fps / 30 * 100, String(fps)], ['Cuadros descartados', (30 - fps) / 30 * 100, String(30 - fps)]];
    $('#yMeters').innerHTML = M.map(m => `<div class="meter"><span>${m[0]}</span><div class="t"><i style="width:${Math.max(0, Math.min(100, m[1]))}%;${m[0].startsWith('Cuadros') ? 'background:var(--bad)' : ''}"></i></div><b>${m[2] === '%' ? Math.round(m[1]) + ' %' : m[2]}</b></div>`).join(''); }
  /* ---------- bucle ---------- */
  let lt = performance.now(), acc = 0;
  function loop(now) { const dt = Math.min(.05, (now - lt) / 1000); lt = now; if (visible) { draw(now); gStep(dt); gantt(); acc += dt; if (acc > .4) { acc = 0; meters(); } } requestAnimationFrame(loop); }
  newFrame(); ui(); requestAnimationFrame(loop);
  onRoute((p, sub) => { const v = p === 'simulacion' && sub === 'yolo'; if (v && !visible) t0 = performance.now(); visible = v; });
  $('#yStages').onclick = e => { const b = e.target.closest('button'); if (b) setStage(+b.dataset.i); };
  $('#yPlay').onclick = () => { playing = !playing; $('#yPlay').textContent = playing ? 'Pausar' : 'Reproducir'; t0 = performance.now(); };
  $('#yNext').onclick = () => setStage(stg + 1); $('#yPrev').onclick = () => setStage(stg - 1);
  const sl = (id, out) => $(id).addEventListener('input', () => { $(out).textContent = nf(+$(id).value, 2); retrace(); nmsK = 0; ui(); });
  sl('#yConf', '#yConfV'); sl('#yIou', '#yIouV'); $('#yScale').onchange = ui;
  if (RM) $('#yPlay').textContent = 'Reproducir';
})();
