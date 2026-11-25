/* Modelo OSI: encapsulación con bytes reales */
(() => {
  const { $, $$, nf, prep, css, onRoute, RM } = FG;
  const COLS = [['Servidor YOLO', '192.168.10.10', 7], ['SW1 · entrada', 'Fa0/1 → Gi0/1', 2], ['R1 · router', 'G0/0.10 → .20', 3], ['SW1 · salida', 'Gi0/1 → Fa0/2', 2], ['Cliente VLC', '192.168.20.10', 7]];
  const LN = { 7: 'Aplicación', 6: 'Presentación', 5: 'Sesión', 4: 'Transporte', 3: 'Red', 2: 'Enlace', 1: 'Física' };
  const CELL = { 0: { 7: 'RTSP / RTP', 6: 'H.264', 5: 'Sesión RTSP', 4: 'UDP', 3: 'IPv4', 2: 'Ethernet', 1: 'bits' }, 1: { 2: 'MAC + VLAN', 1: 'bits' }, 2: { 3: 'enruta · TTL · QoS', 2: '802.1Q', 1: 'bits' }, 3: { 2: 'MAC + VLAN', 1: 'bits' }, 4: { 7: 'VLC', 6: 'H.264', 5: 'RTP / RTCP', 4: 'UDP', 3: 'IPv4', 2: 'Ethernet', 1: 'bits' } };
  const LC = { 7: '#7c3aed', 6: '#c026d3', 5: '#db2777', 4: '#ea580c', 3: '#ca8a04', 2: '#16a34a', t: '#0d5f2c', 1: '#0891b2' };

  /* ---------- construcción real de los bytes ---------- */
  const MAC = { srv: [0x00, 0x50, 0x56, 0xa1, 0x10, 0x10], r: [0x00, 0xd0, 0xba, 0x11, 0x00, 0x01], cli: [0x00, 0x50, 0x56, 0xa1, 0x20, 0x10] };
  const IP = { srv: [192, 168, 10, 10], cli: [192, 168, 20, 10] };
  const PAY = new Uint8Array(1400); PAY[0] = 0x7c; PAY[1] = 0x85; { let s = 20261124; for (let i = 2; i < 1400; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; PAY[i] = s >>> 24; } }
  const SEQ = 0x80d6, TS = 0x0034bc00, SSRC = 0x5a17c0de;
  const be16 = v => [(v >> 8) & 255, v & 255], be32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const hx = (a, sep = ':') => a.map(b => b.toString(16).padStart(2, '0')).join(sep);
  const sum16 = a => { let s = 0; for (let i = 0; i < a.length; i += 2) s += (a[i] << 8) + (a[i + 1] || 0); while (s >> 16) s = (s & 0xffff) + (s >> 16); return (~s) & 0xffff; };
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return a => { let c = 0xffffffff; for (const b of a) c = t[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
  function rtp() { return { b: [0x80, 0x60, ...be16(SEQ), ...be32(TS), ...be32(SSRC)], f: [['rtp_v', 'RTP versión 2, sin relleno ni extensión, CC 0', 0, 1, 5], ['rtp_pt', 'Marker 0, tipo de carga 96 (H.264 dinámico)', 1, 1, 5], ['rtp_seq', `Número de secuencia ${SEQ}`, 2, 2, 5], ['rtp_ts', `Timestamp ${TS} (reloj de 90 kHz)`, 4, 4, 5], ['rtp_ssrc', `SSRC 0x${SSRC.toString(16)} (identifica el stream)`, 8, 4, 5]] }; }
  function build(kind, ttl = 64) {
    const F = [], B = [];
    const add = (bytes, fields, base) => { fields.forEach(f => F.push({ id: f[0], name: f[1], start: base + f[2], len: f[3], l: f[4] })); B.push(...bytes); };
    const pay = () => { const s = B.length; B.push(...PAY); F.push({ id: 'pay', name: 'Carga H.264: FU-A (0x7C), cabecera FU 0x85 (inicio, NAL tipo 5 IDR) y datos del cuadro', start: s, len: 1400, l: 6 }); };
    if (kind === 'nal') { pay(); return { B, F }; }
    const R = rtp();
    if (kind === 'rtp') { add(R.b, R.f, 0); pay(); return { B, F }; }
    const data = [...R.b, ...PAY], ulen = 8 + data.length;
    const pseudo = [...IP.srv, ...IP.cli, 0, 17, ...be16(ulen)], uh0 = [...be16(8000), ...be16(49152), ...be16(ulen), 0, 0];
    let uck = sum16([...pseudo, ...uh0, ...data]); if (!uck) uck = 0xffff;
    const U = { b: [...be16(8000), ...be16(49152), ...be16(ulen), ...be16(uck)], f: [['u_sp', 'Puerto origen 8000 (MediaMTX)', 0, 2, 4], ['u_dp', 'Puerto destino 49152 (VLC)', 2, 2, 4], ['u_len', `Longitud UDP ${ulen} B`, 4, 2, 4], ['u_ck', `Checksum UDP 0x${uck.toString(16).padStart(4, '0')} (con pseudo-cabecera)`, 6, 2, 4]] };
    const tl = 20 + ulen, ih0 = [0x45, 0x88, ...be16(tl), 0x1c, 0x46, 0x40, 0x00, ttl, 17, 0, 0, ...IP.srv, ...IP.cli], ick = sum16(ih0);
    const I = { b: [...ih0.slice(0, 10), ...be16(ick), ...ih0.slice(12)], f: [['i_vh', 'Versión 4, cabecera de 20 B (IHL 5)', 0, 1, 3], ['i_tos', 'DSCP AF41 (34) · ECN 0 → ToS 0x88', 1, 1, 3], ['i_len', `Longitud total ${tl} B`, 2, 2, 3], ['i_id', 'Identificación 0x1c46', 4, 2, 3], ['i_ff', 'Flags: no fragmentar (DF)', 6, 2, 3], ['ttl', `TTL ${ttl}`, 8, 1, 3], ['i_p', 'Protocolo 17 (UDP)', 9, 1, 3], ['i_ck', `Checksum de cabecera 0x${ick.toString(16).padStart(4, '0')}`, 10, 2, 3], ['i_src', 'IP origen 192.168.10.10', 12, 4, 3], ['i_dst', 'IP destino 192.168.20.10', 16, 4, 3]] };
    const l3 = () => { add(I.b, I.f, B.length); add(U.b, U.f, B.length); add(R.b, R.f, B.length); pay(); };
    const l4 = () => { add(U.b, U.f, B.length); add(R.b, R.f, B.length); pay(); };
    if (kind === 'udp') { l4(); return { B, F }; }
    if (kind === 'ip') { l3(); return { B, F }; }
    const fr = { f1: ['r', 'srv', null], f2: ['r', 'srv', 10], f3: ['cli', 'r', 20], f4: ['cli', 'r', null] }[kind];
    const dn = { r: 'R1 G0/0', cli: 'Cliente VLC', srv: 'Servidor YOLO' };
    add([...MAC[fr[0]], ...MAC[fr[1]]], [['e_dst', `MAC destino ${hx(MAC[fr[0]])} (${dn[fr[0]]})`, 0, 6, 2], ['e_src', `MAC origen ${hx(MAC[fr[1]])} (${dn[fr[1]]})`, 6, 6, 2]], 0);
    if (fr[2]) { const tci = (4 << 13) | fr[2]; add([0x81, 0x00, ...be16(tci)], [['tag', `802.1Q: TPID 0x8100 · PCP 4 (CoS de video) · VID ${fr[2]}`, 0, 4, 't']], B.length); }
    add([0x08, 0x00], [['e_type', 'EtherType 0x0800 (IPv4)', 0, 2, 2]], B.length);
    l3();
    const c = CRC(B), fcs = [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
    add(fcs, [['fcs', `FCS (CRC-32) 0x${c.toString(16).padStart(8, '0')}: el receptor recalcula y compara`, 0, 4, 2]], B.length);
    return { B, F };
  }

  /* ---------- pasos ---------- */
  const S = (c, l, title, text, pdu, extra = {}) => ({ c, l, title, text, pdu, ...extra });
  const STEPS = [
    S(0, 7, 'Aplicación: el cuadro anotado sale de YOLO', 'YOLOv8n dibujó las cajas sobre el cuadro de 1280×720. MediaMTX lo publica como stream RTSP: el cliente ya pidió reproducirlo. Sin comprimir, el cuadro pesa 2,7 MB.', 'img'),
    S(0, 6, 'Presentación: compresión H.264', 'El códec guarda solo lo que cambió respecto al cuadro anterior: un cuadro P de 720p queda en unos 8 KB. El resultado se divide en unidades NAL y, por tamaño, en fragmentos FU-A de 1400 B.', 'nal'),
    S(0, 5, 'Sesión: RTSP abre la sesión, RTP la numera', 'La sesión RTSP (SETUP y PLAY, Session: 4F2A9C1E) ya está activa. Cada fragmento recibe una cabecera RTP de 12 B con número de secuencia, timestamp de 90 kHz y SSRC, para ordenar y sincronizar.', 'rtp', { hl: ['rtp_seq', 'rtp_ts'] }),
    S(0, 4, 'Transporte: datagrama UDP', 'Se agregan 8 B de UDP: puerto 8000 del servidor hacia el 49152 del VLC. UDP no retransmite: para video en vivo es mejor perder un paquete que esperar.', 'udp', { hl: ['u_sp', 'u_dp', 'u_ck'] }),
    S(0, 3, 'Red: paquete IPv4 marcado AF41', 'Cabecera IP de 20 B. El destino 192.168.20.10 está en otra red, así que se envía a la puerta de enlace 192.168.10.1. El campo ToS lleva DSCP AF41 para que el router priorice el video.', 'ip', { hl: ['i_tos', 'ttl', 'i_ck'] }),
    S(0, 2, 'Enlace: trama Ethernet', 'Con ARP, el servidor conoce la MAC del router y arma la trama: MAC destino, MAC origen, EtherType y al final el FCS (CRC-32) para detectar errores.', 'f1', { hl: ['e_dst', 'e_src', 'fcs'] }),
    S(0, 1, 'Física: bits por el cable UTP', 'La NIC envía preámbulo y SFD, y luego cada bit de la trama por Fa0/1 a 100 Mbps. En 100BASE-TX los bits pasan por 4B/5B y MLT-3. Serializar la trama tarda 117 µs.', 'f1', { wire: 1, bits: 1 }),
    S(1, 1, 'SW1 recibe los bits en Fa0/1', 'El switch reconstruye la trama a partir de la señal eléctrica.', 'f1', { bits: 1 }),
    S(1, 2, 'SW1 conmuta: aprende, busca y etiqueta', 'Verifica el FCS, aprende que la MAC del servidor está en Fa0/1 (VLAN 10) y busca la MAC del router: está en la troncal Gi0/1. Inserta la etiqueta 802.1Q con VID 10 y recalcula el FCS. El DSCP se respeta (mls qos trust dscp).', 'f2', { hl: ['tag', 'fcs'] }),
    S(1, 1, 'Sale por la troncal Gi0/1 a 1 Gbps', '1000BASE-T usa los 4 pares con PAM-5: serializar la trama etiquetada tarda unos 12 µs.', 'f2', { wire: 1, bits: 1 }),
    S(2, 1, 'R1 recibe los bits en G0/0', 'El router reconstruye la trama etiquetada.', 'f2', { bits: 1 }),
    S(2, 2, 'Subinterfaz G0/0.10 acepta la trama', 'VID 10 corresponde a G0/0.10 (encapsulation dot1Q 10). El FCS es correcto y la MAC destino es la del router: quita la cabecera Ethernet y entrega el paquete a la capa 3.', 'ip', { hl: ['i_dst'] }),
    S(2, 3, 'R1 enruta, baja el TTL y clasifica', 'La red 192.168.20.0/24 está conectada en G0/0.20. La ACL 120 permite el video. El TTL baja de 64 a 63 y se recalcula el checksum. DSCP AF41 coincide con la clase VIDEO: el paquete espera en su cola del shaper de 20 Mbps.', 'ip2', { hl: ['ttl', 'i_ck'] }),
    S(2, 2, 'Nueva trama hacia la VLAN 20', 'MAC origen: el router. MAC destino: el cliente (por ARP). Etiqueta 802.1Q con VID 20 y FCS nuevo: el contenido IP es el mismo salvo TTL y checksum.', 'f3', { hl: ['e_dst', 'e_src', 'tag', 'fcs'] }),
    S(2, 1, 'Vuelve por la troncal hacia SW1', 'La trama baja por el mismo cable físico: router-on-a-stick usa la troncal en los dos sentidos.', 'f3', { wire: 1, bits: 1 }),
    S(3, 1, 'SW1 recibe en Gi0/1', 'Llega la trama con VID 20.', 'f3', { bits: 1 }),
    S(3, 2, 'SW1 entrega en la VLAN 20 por Fa0/2', 'La MAC del cliente está en Fa0/2, un puerto de acceso de la VLAN 20: el switch quita la etiqueta 802.1Q y recalcula el FCS.', 'f4', { hl: ['e_dst', 'fcs'] }),
    S(3, 1, 'Sale por Fa0/2 hacia el cliente', 'Otra vez 100 Mbps por UTP hasta el PC del operador.', 'f4', { wire: 1, bits: 1 }),
    S(4, 1, 'El cliente recibe los bits', 'La NIC reconstruye la trama.', 'f4', { bits: 1 }),
    S(4, 2, 'Enlace: FCS correcto, la trama es para mí', 'El CRC-32 calculado coincide con el FCS, la MAC destino es la propia y EtherType 0x0800 indica IPv4: se quita la cabecera Ethernet.', 'ip2', { hl: ['i_dst'] }),
    S(4, 3, 'Red: el paquete es para esta IP', 'IP destino 192.168.20.10, checksum correcto, protocolo 17: se entrega a UDP. TTL 63 indica que pasó por un router.', 'udp', { hl: ['u_dp'] }),
    S(4, 4, 'Transporte: puerto 49152 → VLC', 'El puerto destino identifica el proceso: VLC. El checksum UDP confirma que los datos no se dañaron.', 'rtp', { hl: ['rtp_seq'] }),
    S(4, 5, 'Sesión: RTP ordena, RTCP informa', 'El número de secuencia detecta pérdidas o desorden; el búfer de jitter (network-caching) absorbe variaciones de retardo. RTCP reporta al servidor la pérdida y el jitter medidos.', 'nal'),
    S(4, 6, 'Presentación: decodificación H.264', 'Se juntan los fragmentos FU-A del cuadro y el decodificador reconstruye la imagen de 1280×720 a partir del cuadro anterior.', 'img'),
    S(4, 7, 'Aplicación: VLC muestra el cuadro', 'El operador ve el video con las cajas de YOLO. Desde la cámara pasaron unos 100 ms más el búfer del reproductor.', 'img'),
  ];
  const PDUSEG = {
    img: [['Cuadro anotado 1280×720', 7, 10]], nal: [['H.264 · FU-A 1400 B', 6, 10]], rtp: [['RTP 12', 5, 2.5], ['H.264 1400 B', 6, 8]],
    udp: [['UDP 8', 4, 2], ['RTP 12', 5, 2.5], ['H.264 1400 B', 6, 8]], ip: [['IPv4 20', 3, 3], ['UDP 8', 4, 2], ['RTP 12', 5, 2.5], ['H.264', 6, 7]],
    f1: [['Eth 14', 2, 3], ['IPv4 20', 3, 3], ['UDP 8', 4, 2], ['RTP 12', 5, 2.5], ['H.264', 6, 6], ['FCS', 2, 1.5]],
    f2: [['Eth 14', 2, 3], ['802.1Q', 't', 1.6], ['IPv4 20', 3, 3], ['UDP 8', 4, 2], ['RTP', 5, 2], ['H.264', 6, 5.5], ['FCS', 2, 1.5]]
  };
  PDUSEG.f3 = PDUSEG.f2; PDUSEG.f4 = PDUSEG.f1; PDUSEG.ip2 = PDUSEG.ip;
  const PDUN = { img: 'Datos de aplicación', nal: 'Datos (unidad NAL)', rtp: 'Datos con cabecera RTP', udp: 'Datagrama UDP · 1420 B', ip: 'Paquete IP · 1440 B', ip2: 'Paquete IP · 1440 B (TTL 63)', f1: 'Trama Ethernet · 1458 B', f2: 'Trama 802.1Q · 1462 B (VLAN 10)', f3: 'Trama 802.1Q · 1462 B (VLAN 20)', f4: 'Trama Ethernet · 1458 B' };
  const DATA = {}; ['nal', 'rtp', 'udp', 'ip', 'f1', 'f2', 'f3', 'f4'].forEach(k => DATA[k] = build(k)); DATA.ip2 = build('ip', 63); DATA.f3 = build('f3', 63); DATA.f4 = build('f4', 63);

  /* ---------- rejilla ---------- */
  const grid = $('#osiGrid');
  let g = '<div></div>' + COLS.map(c => `<div class="hd">${c[0]}<small>${c[1]}</small></div>`).join('');
  for (let l = 7; l >= 1; l--) { g += `<div class="ln"><i style="background:${LC[l]}"></i>${l}<span>&nbsp;${LN[l]}</span></div>`; COLS.forEach((c, ci) => { g += `<div class="cell${l > c[2] ? ' off' : ''}" data-c="${ci}" data-l="${l}">${l <= c[2] ? CELL[ci][l] : ''}</div>`; }); }
  grid.innerHTML = g;
  const wrap = $('#osiWrap'), tok = document.createElement('div'); tok.className = 'token'; wrap.appendChild(tok);
  const bitsEl = document.createElement('div'); bitsEl.className = 'bits'; wrap.appendChild(bitsEl);
  const cellAt = (c, l) => grid.querySelector(`.cell[data-c="${c}"][data-l="${l}"]`);
  function place(c, l) { const r = cellAt(c, l).getBoundingClientRect(), w = wrap.getBoundingClientRect(); tok.style.left = (r.left - w.left + 6) + 'px'; tok.style.top = (r.top - w.top + r.height / 2 - tok.offsetHeight / 2) + 'px'; }
  function wires() { wrap.querySelectorAll('.wire').forEach(e => e.remove()); const w = wrap.getBoundingClientRect(); for (let c = 0; c < 4; c++) { const a = cellAt(c, 1).getBoundingClientRect(), b = cellAt(c + 1, 1).getBoundingClientRect(); const d = document.createElement('div'); d.className = 'wire'; d.style.left = (a.right - w.left) + 'px'; d.style.width = (b.left - a.right) + 'px'; d.style.top = (a.top - w.top + a.height / 2 - 2) + 'px'; wrap.appendChild(d); } }

  const SHORT = { rtp_v: 'RTP V/P/X/CC', rtp_pt: 'RTP M/PT', rtp_seq: 'RTP secuencia', rtp_ts: 'RTP timestamp', rtp_ssrc: 'RTP SSRC', u_sp: 'UDP puerto origen', u_dp: 'UDP puerto destino', u_len: 'UDP longitud', u_ck: 'UDP checksum', i_vh: 'IP versión/IHL', i_tos: 'IP DSCP/ECN', i_len: 'IP longitud total', i_id: 'IP identificación', i_ff: 'IP flags', ttl: 'IP TTL', i_p: 'IP protocolo', i_ck: 'IP checksum', i_src: 'IP origen', i_dst: 'IP destino', e_dst: 'MAC destino', e_src: 'MAC origen', tag: 'Etiqueta 802.1Q', e_type: 'EtherType', fcs: 'FCS', pay: 'Carga H.264' };
  /* ---------- render del paso ---------- */
  let k = 0, playing = true, timer = null;
  const fieldsOf = key => DATA[key] ? DATA[key].F : [];
  function hex(key, hl) {
    const D = DATA[key]; if (!D) return `<span style="color:#8ea0c0">Datos de aplicación: imagen de 1280 × 720 píxeles × 3 canales = 2 764 800 bytes, con ${'2'} cajas de detección dibujadas. Todavía no hay cabeceras de red.</span>`;
    const { B, F } = D, col = new Array(B.length), ttl = new Array(B.length), hset = new Set(hl || []);
    F.forEach(f => { for (let i = f.start; i < f.start + f.len; i++) { col[i] = f; } });
    const pay = F.find(f => f.id === 'pay'), cut = pay.start + 16, resume = pay.start + pay.len;
    const sp = i => { const f = col[i]; const c = LC[f.l]; return `<span class="b${hset.has(f.id) ? ' hl' : ''}" data-f="${f.id}" style="background:${c}${hset.has(f.id) ? 'cc' : '55'}" title="${f.name}">${B[i].toString(16).padStart(2, '0')}</span>`; };
    let h = '', i = 0;
    const row = (from, to) => { for (let r = from; r < to; r += 16) { h += `<span class="off">${r.toString(16).padStart(4, '0')}</span>`; for (let j = r; j < Math.min(to, r + 16); j++) h += sp(j) + (j % 8 === 7 ? '  ' : ' '); h += '\n'; } };
    row(0, cut); h += `<span class="off">····</span><span style="color:#8ea0c0">… ${resume - cut} bytes más de video H.264 …</span>\n`; if (resume < B.length) row(resume, B.length);
    return h;
  }
  function render(anim = true) {
    const s = STEPS[k];
    $$('#osiGrid .cell').forEach(c => { c.classList.remove('act'); const idx = STEPS.findIndex(t => t.c === +c.dataset.c && t.l === +c.dataset.l); c.classList.toggle('done', idx >= 0 && STEPS.slice(0, k).some(t => t.c === +c.dataset.c && t.l === +c.dataset.l)); });
    cellAt(s.c, s.l).classList.add('act'); place(s.c, s.l); tok.textContent = 'L' + s.l;
    $('#osiWhere').textContent = `Paso ${k + 1} de ${STEPS.length} · ${COLS[s.c][0]} · capa ${s.l} ${LN[s.l]}`;
    $('#osiTitle').textContent = s.title; $('#osiText').textContent = s.text;
    $('#osiPduName').textContent = 'PDU: ' + PDUN[s.pdu];
    const prev = k ? STEPS[k - 1].pdu : null, ps = PDUSEG[s.pdu], pp = prev ? PDUSEG[prev].map(x => x[0]) : [];
    $('#osiPdu').innerHTML = ps.map(x => `<span class="${anim && !pp.includes(x[0]) ? 'new' : ''}" style="flex-grow:${x[2]};background:${LC[x[1]]}">${x[0]}</span>`).join('');
    $('#osiHex').innerHTML = hex(s.pdu, s.hl);
    const F = fieldsOf(s.pdu), hs = new Set(s.hl || []);
    $('#osiFields').innerHTML = F.length ? F.map(f => `<tr data-f="${f.id}"${hs.has(f.id) ? ' style="font-weight:700"' : ''}><td><i class="lay" style="background:${LC[f.l]}"></i>${SHORT[f.id] || f.id}</td><td>${f.name}</td><td class="n">${f.len}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Sin cabeceras todavía: solo datos de la aplicación.</td></tr>';
    if (s.wire) { const a = cellAt(s.c, 1).getBoundingClientRect(), b = cellAt(s.c + 1, 1).getBoundingClientRect(), w = wrap.getBoundingClientRect(); bitsEl.style.left = (a.right - w.left + 4) + 'px'; bitsEl.style.top = (a.top - w.top - 14) + 'px'; bitsEl.textContent = '10101010 10101011 ' + bitsOf(s.pdu).slice(16, 40).join('').replace(/(.{8})/g, '$1 '); bitsEl.style.opacity = 1; setTimeout(() => place(s.c + 1, 1), 350); }
    else bitsEl.style.opacity = 0;
    wave(s);
  }
  /* ---------- señal en el cable ---------- */
  function bitsOf(key) { const D = DATA[key] && DATA[key].B.length > 20 && key.startsWith('f') ? DATA[key].B : DATA.f1.B; const bytes = [0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0xd5, ...D.slice(0, 8)]; const o = []; bytes.forEach(b => { for (let i = 0; i < 8; i++) o.push((b >> i) & 1); }); return o; }
  const B45 = ['11110', '01001', '10100', '10101', '01010', '01011', '01110', '01111', '10010', '10011', '10110', '10111', '11010', '11011', '11100', '11101'];
  function wave(s) {
    const { x, W, H } = prep($('#osiWave')); x.clearRect(0, 0, W, H);
    const code = $('#osiCode').value, key = s.pdu.startsWith('f') ? s.pdu : 'f1';
    let bits = bitsOf(key), labels = null;
    if (code === 'mlt3') { const D = DATA[key].B; const sym = ['11000', '10001']; [0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0xd5, ...D.slice(0, 4)].forEach(b => { sym.push(B45[b & 15], B45[b >> 4]); }); bits = sym.join('').split('').map(Number); labels = sym; }
    const N = Math.min(bits.length, Math.floor((W - 40) / 13)), cw = (W - 40) / N, y0 = H * .62, A = H * .26, ink = css('--muted'), sig = LC[1];
    x.font = '11px "IBM Plex Mono",monospace'; x.fillStyle = ink; x.textAlign = 'center';
    for (let i = 0; i < N; i++) x.fillText(bits[i], 30 + i * cw + cw / 2, 14);
    x.strokeStyle = css('--line'); x.lineWidth = 1; x.beginPath(); x.moveTo(30, y0); x.lineTo(W - 10, y0); x.stroke();
    x.strokeStyle = sig; x.lineWidth = 2.5; x.beginPath();
    let lvl = 0, st = 0; const seq = [0, 1, 0, -1];
    const Y = v => y0 - v * A;
    for (let i = 0; i < N; i++) {
      const a = 30 + i * cw, b = a + cw, m = a + cw / 2, bt = bits[i];
      if (code === 'nrz') { const v = bt ? 1 : -1; if (!i) x.moveTo(a, Y(v)); x.lineTo(a, Y(v)); x.lineTo(b, Y(v)); }
      else if (code === 'manch') { const v1 = bt ? -1 : 1, v2 = -v1; if (!i) x.moveTo(a, Y(v1)); x.lineTo(a, Y(v1)); x.lineTo(m, Y(v1)); x.lineTo(m, Y(v2)); x.lineTo(b, Y(v2)); }
      else if (code === 'mlt3') { if (bt) { st = (st + 1) % 4; } lvl = seq[st]; if (!i) x.moveTo(a, Y(lvl)); x.lineTo(a, Y(lvl)); x.lineTo(b, Y(lvl)); }
      else { if (i % 2) continue; const d = (bits[i] << 1) | (bits[i + 1] || 0), v = [-1, -.5, .5, 1][d], e = a + cw * 2; if (!i) x.moveTo(a, Y(v)); x.lineTo(a, Y(v)); x.lineTo(e, Y(v)); }
    }
    x.stroke();
    x.textAlign = 'left'; x.fillStyle = ink; x.font = '12px "IBM Plex Sans",sans-serif';
    const info = { nrz: 'NRZ: 1 = nivel alto, 0 = nivel bajo (base didáctica)', manch: 'Manchester (10BASE-T): 0 = alto→bajo, 1 = bajo→alto, siempre hay transición en el centro', mlt3: 'Símbolos /J/K/ y 4B/5B del preámbulo y la MAC destino; MLT-3 cambia de nivel (0,+,0,−) en cada 1', pam5: 'PAM-5 (1000BASE-T): 2 bits por símbolo en cinco niveles; aquí un solo par, ilustrativo' }[code];
    x.fillText(info, 30, H - 8);
    if (labels) { x.fillStyle = css('--brand'); x.font = '600 10px "IBM Plex Mono",monospace'; let p = 0; labels.forEach((l, j) => { if (p >= N) return; x.fillText(j === 0 ? '/J/' : j === 1 ? '/K/' : '', 30 + p * cw + 2, 28); p += 5; }); }
    $('#waveBox').style.opacity = s.bits ? 1 : .45;
  }
  /* ---------- control ---------- */
  const go = d => { k = (k + d + STEPS.length) % STEPS.length; render(); };
  function tick() { clearTimeout(timer); if (playing && visible) timer = setTimeout(() => { go(1); tick(); }, +$('#osiSpeed').value); }
  let visible = false;
  onRoute((p, sub) => { visible = p === 'simulacion' && sub === 'osi'; if (visible) { wires(); render(false); tick(); } else clearTimeout(timer); });
  $('#osiPlay').onclick = () => { playing = !playing; $('#osiPlay').textContent = playing ? 'Pausar' : 'Reproducir'; tick(); };
  $('#osiNext').onclick = () => { go(1); tick(); }; $('#osiPrev').onclick = () => { go(-1); tick(); };
  $('#osiReset').onclick = () => { k = 0; render(); tick(); };
  $('#osiSpeed').onchange = tick; $('#osiCode').onchange = () => wave(STEPS[k]);
  grid.addEventListener('click', e => { const c = e.target.closest('.cell'); if (!c) return; const i = STEPS.findIndex(t => t.c === +c.dataset.c && t.l === +c.dataset.l); if (i >= 0) { k = i; render(); tick(); } });
  $('#osiHex').addEventListener('mouseover', e => { const b = e.target.closest('.b'); $$('#osiFields tr').forEach(r => r.style.background = b && r.dataset.f === b.dataset.f ? 'var(--brandbg)' : ''); });
  addEventListener('resize', () => { if (visible) { wires(); place(STEPS[k].c, STEPS[k].l); wave(STEPS[k]); } });
  if (RM) playing = false, $('#osiPlay').textContent = 'Reproducir';
})();
