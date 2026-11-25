/* Guía: calculadora, colas con prioridad y quiz */
(() => {
  const { $, $$, nf, onRoute } = FG;
  function calc() { const [w, h] = $('#gRes').value.split('x').map(Number), f = +$('#gFps').value, b = +$('#gCod').value, px = w * h * f, br = px * b;
    $('#gPx').textContent = nf(px / 1e6, 1) + ' MPx/s'; $('#gBr').textContent = nf(br / 1e6, 2) + ' Mbps'; $('#gPk').textContent = String(Math.round(br / 8 / 1400)); $('#gRaw').textContent = nf(px * 24 / 1e6, 0) + ' Mbps'; }
  ['#gRes', '#gFps', '#gCod'].forEach(i => $(i).addEventListener('change', calc)); calc();

  /* colas */
  const CL = [['AF41 · video', '#ff9a3d', .45], ['AF31 · IoT', '#facc15', .25], ['BE · oficina', '#8ea0bd', .5]], LIM = 14;
  let Q = [[], [], []], ALL = [], drops = [0, 0, 0], sent = [0, 0, 0], cong = false, cap = 0, rr = 0, credit = [0, 0, 0], vis = false;
  function rows() { const f = $('#qSch').value === 'fifo';
    $('#qRows').innerHTML = (f ? [['Cola única FIFO', null]] : CL.map(c => [c[0], c[1]])).map((c, i) => `<div class="qrow2"><span>${c[0]}</span><div class="qslots" id="qs${i}"></div><b class="mono" id="qd${i}"></b></div>`).join(''); }
  function tick() { if (!vis) return; const f = $('#qSch').value;
    CL.forEach((c, i) => { let a = c[2] * (cong && i === 2 ? 4.5 : 1); while (a > 0) { if (Math.random() < Math.min(1, a)) { if (f === 'fifo') { ALL.length < LIM * 2 ? ALL.push(i) : drops[i]++; } else { Q[i].length < LIM ? Q[i].push(i) : drops[i]++; } } a -= 1; } });
    cap += 1.25;
    while (cap >= 1) { cap -= 1; let k = -1;
      if (f === 'fifo') { if (ALL.length) k = ALL.shift(); }
      else if (f === 'sp') { for (let i = 0; i < 3; i++) if (Q[i].length) { k = Q[i].shift(); break; } }
      else { const W = [5, 3, 2]; for (let n = 0; n < 6 && k < 0; n++) { if (Q[rr].length && credit[rr] < W[rr]) { k = Q[rr].shift(); credit[rr]++; } else { credit[rr] = 0; rr = (rr + 1) % 3; } } }
      if (k >= 0) sent[k]++; }
    if (f === 'fifo') { $('#qs0').innerHTML = ALL.map(i => `<i style="background:${CL[i][1]}"></i>`).join(''); $('#qd0').textContent = drops.reduce((a, b) => a + b, 0) + ' desc.'; }
    else Q.forEach((q, i) => { $('#qs' + i).innerHTML = q.map(() => `<i style="background:${CL[i][1]}"></i>`).join(''); $('#qd' + i).textContent = drops[i] + ' desc.'; });
    const tot = sent.reduce((a, b) => a + b, 0) || 1;
    $('#qMsg').textContent = `Descartes: video ${drops[0]} · IoT ${drops[1]} · oficina ${drops[2]}. Del enlace usado, el video ocupó ${Math.round(sent[0] / tot * 100)} %.` + (f === 'fifo' && cong ? ' Sin QoS el video se descarta igual que el resto.' : f === 'sp' && cong ? ' Con prioridad estricta el video nunca espera; la oficina se descarta.' : '');
  }
  const reset = () => { Q = [[], [], []]; ALL = []; drops = [0, 0, 0]; sent = [0, 0, 0]; rows(); };
  $('#qSch').onchange = reset; $('#qCong').onclick = () => { cong = !cong; $('#qCong').textContent = cong ? 'Quitar congestión' : 'Congestionar'; drops = [0, 0, 0]; sent = [0, 0, 0]; };
  rows(); setInterval(tick, 140);
  onRoute((p, s) => vis = p === 'simulacion' && s === 'guia');

  /* quiz */
  const QZ = [
    ['Si sube la resolución de 720p a 1080p con el mismo códec y FPS, ¿qué pasa con el bitrate?', ['Se mantiene igual', 'Sube unas 2,25 veces', 'Baja a la mitad'], 1, '1080p tiene 2,25 veces más píxeles que 720p, y el bitrate es proporcional a los píxeles.'],
    ['El servidor está en la VLAN 10 y el cliente en la VLAN 20. ¿Qué equipo permite que se comuniquen?', ['El switch', 'El router', 'El cable troncal'], 1, 'El switch separa las VLAN; el router enruta entre ellas con sus subinterfaces.'],
    ['¿Qué hace la etiqueta 802.1Q en la troncal?', ['Cifra la trama', 'Indica a qué VLAN pertenece la trama', 'Cambia la IP de destino'], 1, 'La etiqueta de 4 B lleva el VID (12 bits) y la prioridad CoS (3 bits).'],
    ['Con la red llena, ¿qué logra marcar el video con DSCP AF41 y configurar CBWFQ?', ['Que el video tenga ancho de banda reservado y se descarte menos', 'Que el enlace sea más rápido', 'Que no haya ningún descarte en la red'], 0, 'QoS no crea capacidad: reparte la existente y protege la clase VIDEO.'],
    ['¿Qué cambia el router en el paquete IP al reenviarlo?', ['La IP de destino', 'El TTL y el checksum', 'El puerto UDP'], 1, 'El TTL baja en 1 y el checksum de cabecera se recalcula; las MAC y la etiqueta de VLAN también cambian, pero esas son de capa 2.'],
    ['¿Para qué sirve NMS en YOLO?', ['Para acelerar la cámara', 'Para quitar las cajas repetidas sobre un mismo objeto', 'Para comprimir el video'], 1, 'Conserva la caja de mayor confianza y elimina las que se solapan con IoU mayor al umbral.'],
  ];
  let ok = 0, answered = 0;
  $('#quiz').innerHTML = QZ.map((q, i) => `<div class="qq" data-q="${i}"><p class="q">${i + 1}. ${q[0]}</p>${q[1].map((o, j) => `<button type="button" data-o="${j}">${String.fromCharCode(65 + j)}) ${o}</button>`).join('')}<p class="fb"></p></div>`).join('');
  $('#quiz').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const box = b.closest('.qq'); if (box.dataset.done) return; box.dataset.done = 1; const q = QZ[+box.dataset.q], good = +b.dataset.o === q[2];
    b.classList.add(good ? 'ok' : 'ko'); if (!good) box.querySelectorAll('button')[q[2]].classList.add('ok'); box.querySelector('.fb').textContent = (good ? 'Correcto. ' : 'No exactamente. ') + q[3]; answered++; if (good) ok++;
    $('#quizScore').textContent = `Puntaje: ${ok} de ${answered}` + (answered === QZ.length ? (ok === QZ.length ? ' · ¡Excelente!' : ' · Revise la pestaña Teoría y vuelva a intentarlo.') : ''); });
})();
