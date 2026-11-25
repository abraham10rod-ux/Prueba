/* Detector YOLOv8 real en el navegador con TensorFlow.js */
(() => {
  const { $, nf, onRoute } = FG;
  const NAMES = ['persona', 'bicicleta', 'auto', 'moto', 'avión', 'bus', 'tren', 'camión', 'bote', 'semáforo', 'hidrante', 'señal de pare', 'parquímetro', 'banca', 'pájaro', 'gato', 'perro', 'caballo', 'oveja', 'vaca', 'elefante', 'oso', 'cebra', 'jirafa', 'morral', 'sombrilla', 'bolso', 'corbata', 'maleta', 'frisbee', 'esquís', 'snowboard', 'pelota', 'cometa', 'bate', 'guante de béisbol', 'patineta', 'tabla de surf', 'raqueta', 'botella', 'copa', 'taza', 'tenedor', 'cuchillo', 'cuchara', 'tazón', 'banano', 'manzana', 'sándwich', 'naranja', 'brócoli', 'zanahoria', 'perro caliente', 'pizza', 'dona', 'torta', 'silla', 'sofá', 'planta', 'cama', 'mesa', 'inodoro', 'televisor', 'portátil', 'mouse', 'control remoto', 'teclado', 'celular', 'microondas', 'horno', 'tostadora', 'lavaplatos', 'nevera', 'libro', 'reloj', 'florero', 'tijeras', 'oso de peluche', 'secador', 'cepillo de dientes'];
  const URL0 = 'modelos/yolov8n_web_model/model.json';
  const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js';
  let tfP = null, model = null, inW = 640, inH = 640, el = null, stream = null, running = false, busy = false, fps = 0, lastF = 0, tried = false;
  const cv = $('#dCv'), st = $('#dStatus');
  const status = (t, c = '') => { st.className = 'dstatus ' + c; st.querySelector('span').textContent = t; };
  const loadTF = () => tfP || (tfP = window.tf ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = TFJS; s.onload = res; s.onerror = () => { tfP = null; rej(new Error('No se pudo descargar TensorFlow.js')); }; document.head.appendChild(s); }));
  async function init(loader, label) {
    try {
      status('Descargando TensorFlow.js…'); await loadTF(); await tf.ready(); try { await tf.setBackend('webgl'); } catch (e) { /* queda el backend disponible */ }
      status('Cargando ' + label + '…'); const m = await loader(); const sh = m.inputs[0].shape || [1, 640, 640, 3]; inH = sh[1] > 0 ? sh[1] : 640; inW = sh[2] > 0 ? sh[2] : 640;
      status('Preparando la red (primer cálculo)…'); const z = tf.zeros([1, inH, inW, 3]); const o = m.execute(z); (Array.isArray(o) ? o : [o]).forEach(t => t.dispose()); z.dispose();
      model?.dispose?.(); model = m; status(`Modelo listo · entrada ${inW}×${inH}`, 'ok'); $('#dBk').textContent = tf.getBackend();
      if (el && !running) detectOnce();
    } catch (e) { console.error(e); status('Error: ' + (e.message || e), 'err'); }
  }
  async function tryAuto() { if (tried || model) return; tried = true;
    try { const r = await fetch(URL0, { method: 'HEAD' }); if (!r.ok) throw 0; init(() => tf.loadGraphModel(URL0), 'modelos/yolov8n_web_model'); }
    catch (e) { status('Modelo no encontrado junto al sitio: elija los archivos exportados'); } }
  /* lector de .zip mínimo (almacenado o deflate) para cargar el modelo comprimido */
  async function unzip(file) {
    const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), out = [];
    let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('El .zip está dañado o no es un .zip');
    let p = dv.getUint32(e + 16, true); const n = dv.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = buf.subarray(ds, ds + csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('Compresión del .zip no soportada');
      out.push(new File([data], name.split('/').pop()));
    }
    return out;
  }
  async function fromFiles(list) {
    let fs = [...list];
    try {
      const zips = fs.filter(f => /\.zip$/i.test(f.name));
      for (const z of zips) { status('Descomprimiendo ' + z.name + '…'); fs.push(...await unzip(z)); }
    } catch (e) { return status('No se pudo abrir el .zip: ' + e.message, 'err'); }
    fs = fs.filter(f => !/\.zip$/i.test(f.name));
    const j = fs.find(f => /model\.json$/i.test(f.name)) || fs.find(f => /\.json$/i.test(f.name)), bins = fs.filter(f => /\.bin$/i.test(f.name));
    if (!j || !bins.length) return status(`Faltan archivos: recibí ${fs.map(f => f.name).join(', ') || 'nada'}. Elija el .zip del modelo, o model.json junto con los 4 archivos .bin.`, 'err');
    try { const need = JSON.parse(await j.text()).weightsManifest.flatMap(w => w.paths), have = new Set(bins.map(b => b.name)), miss = need.filter(x => !have.has(x));
      if (miss.length) return status('Faltan estos archivos del modelo: ' + miss.join(', '), 'err'); } catch (e) { return status('model.json no es un modelo de TensorFlow.js válido', 'err'); }
    init(() => tf.loadGraphModel(tf.io.browserFiles([j, ...bins])), j.name);
  }
  $('#dModel').addEventListener('change', e => fromFiles(e.target.files));
  const dz = $('#dDrop'); dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); }); dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); fromFiles(e.dataTransfer.files); });

  /* ---------- fuentes ---------- */
  function stop() { running = false; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } if (el && el.tagName === 'VIDEO') el.pause(); $('#dStop').disabled = true; }
  function showCanvas() { $('#dPh').hidden = true; cv.hidden = false; }
  $('#dCam').onclick = async () => { stop();
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }); }
    catch (e) { return status('La cámara no está disponible en esta vista. En GitHub Pages sí funciona; aquí use una imagen o un video.', 'err'); }
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = stream; await v.play(); el = v; start(); };
  $('#dFile').onchange = e => { const f = e.target.files[0]; if (!f) return; stop(); const url = URL.createObjectURL(f);
    if (f.type.startsWith('video')) { const v = document.createElement('video'); v.src = url; v.muted = true; v.loop = true; v.playsInline = true; v.onloadeddata = () => { v.play(); el = v; start(); }; }
    else { const i = new Image(); i.onload = () => { el = i; showCanvas(); paint(); detectOnce(); }; i.src = url; } };
  $('#dStop').onclick = stop;
  function start() { showCanvas(); running = true; $('#dStop').disabled = false; requestAnimationFrame(loop); }
  const dims = () => el.tagName === 'VIDEO' ? [el.videoWidth, el.videoHeight] : [el.naturalWidth, el.naturalHeight];
  function paint(boxes) { const [w, h] = dims(), k = Math.min(1, 1280 / w); cv.width = Math.round(w * k); cv.height = Math.round(h * k); const x = cv.getContext('2d'); x.drawImage(el, 0, 0, cv.width, cv.height);
    if (!boxes) { if (!model) { x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, cv.height / 2 - 24, cv.width, 48); x.fillStyle = '#fff'; x.font = '600 18px "IBM Plex Sans",sans-serif'; x.textAlign = 'center'; x.fillText('Cargue el modelo para detectar', cv.width / 2, cv.height / 2 + 6); } return; }
    const fs = Math.max(12, cv.width / 60); x.lineWidth = Math.max(2, cv.width / 400); x.font = `600 ${fs}px "IBM Plex Mono",monospace`; x.textAlign = 'left';
    for (const b of boxes) { const col = b.c === 0 ? '#ff9a3d' : '#60a5fa', X = b.x1 * k, Y = b.y1 * k, W = (b.x2 - b.x1) * k, H = (b.y2 - b.y1) * k;
      x.strokeStyle = col; x.strokeRect(X, Y, W, H); const lb = `${NAMES[b.c] || b.c} ${b.s.toFixed(2)}`, tw = x.measureText(lb).width + 8; x.fillStyle = col; x.fillRect(X - 1, Math.max(0, Y - fs - 6), tw, fs + 6); x.fillStyle = '#fff'; x.fillText(lb, X + 3, Math.max(fs, Y - 6)); }
    const n = boxes.filter(b => b.c === 0).length, tag = `personas: ${n}`; x.fillStyle = 'rgba(10,26,51,.85)'; x.fillRect(10, 10, x.measureText(tag).width + 20, fs * 2); x.fillStyle = '#fff'; x.fillText(tag, 20, 10 + fs * 1.35); }
  async function detect() {
    const [w, h] = dims(); if (!w || !h) return null; const m = Math.max(w, h), only = $('#dOnly').checked;
    const input = tf.tidy(() => { const img = tf.browser.fromPixels(el); return tf.image.resizeBilinear(img.pad([[0, m - h], [0, m - w], [0, 0]]), [inH, inW]).div(255).expandDims(0); });
    let out = model.execute(input); if (Array.isArray(out)) { out.slice(1).forEach(t => t.dispose()); out = out[0]; }
    const r = tf.tidy(() => { let t = out.squeeze(0); if (t.shape[0] < t.shape[1]) t = t.transpose(); const nc = t.shape[1] - 4;
      const cx = t.slice([0, 0], [-1, 1]), cy = t.slice([0, 1], [-1, 1]), bw = t.slice([0, 2], [-1, 1]), bh = t.slice([0, 3], [-1, 1]), y1 = cy.sub(bh.div(2)), x1 = cx.sub(bw.div(2));
      const cls = t.slice([0, 4], [-1, nc]); const scores = only ? cls.slice([0, 0], [-1, 1]).squeeze([1]) : cls.max(1), classes = only ? tf.zerosLike(scores).toInt() : cls.argMax(1);
      return { boxes: tf.concat([y1, x1, y1.add(bh), x1.add(bw)], 1), scores, classes }; });
    const idx = await tf.image.nonMaxSuppressionAsync(r.boxes, r.scores, 300, +$('#dIou').value, +$('#dConf').value);
    const B = r.boxes.gather(idx).dataSync(), S = r.scores.gather(idx).dataSync(), K = r.classes.gather(idx).dataSync();
    [input, out, r.boxes, r.scores, r.classes, idx].forEach(t => t.dispose());
    const sx = m / inW, sy = m / inH, res = [];
    for (let i = 0; i < S.length; i++) res.push({ y1: B[i * 4] * sy, x1: B[i * 4 + 1] * sx, y2: B[i * 4 + 2] * sy, x2: B[i * 4 + 3] * sx, s: S[i], c: K[i] });
    return res;
  }
  async function run() { if (busy || !model || !el) return; busy = true; const t0 = performance.now();
    try { const b = await detect(); const ms = performance.now() - t0; if (b) { paint(b); $('#dCount').textContent = b.filter(x => x.c === 0).length; $('#dMs').textContent = Math.round(ms) + ' ms'; const now = performance.now(); if (lastF) fps = fps * .85 + 1000 / (now - lastF) * .15; lastF = now; $('#dFps').textContent = el.tagName === 'VIDEO' ? nf(fps, 1) : '—'; } }
    catch (e) { console.error(e); status('Error al ejecutar: ' + (e.message || e), 'err'); running = false; }
    busy = false; }
  const detectOnce = () => { if (model) run(); else paint(); };
  function loop() { if (!running) return; if (model) run(); else paint(); requestAnimationFrame(loop); }
  ['#dConf', '#dIou'].forEach(id => $(id).addEventListener('input', () => { $(id + 'V').textContent = nf(+$(id).value, 2); if (el && !running) detectOnce(); }));
  $('#dOnly').onchange = () => { if (el && !running) detectOnce(); };
  onRoute((p, sub) => { if (p === 'simulacion' && sub === 'detector') tryAuto(); else if (running) stop(); });
})();
