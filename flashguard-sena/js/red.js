
{
'use strict';
const $=s=>document.querySelector(s);
const nf=(x,d=1)=>(Number.isFinite(x)?x:0).toFixed(d).replace('.',',');
const pad=(s,n)=>String(s).padEnd(n), lpad=(s,n)=>String(s).padStart(n);
const RES={'854x480':[854,480],'1280x720':[1280,720],'1920x1080':[1920,1080]};
const BPP={h264:.07,h265:.045,mjpeg:.6};
const CODN={h264:'H.264',h265:'H.265',mjpeg:'MJPEG'};
const T0=Date.now();
const clock=t=>{const d=new Date(T0+t*1000);return d.toTimeString().slice(0,8)+'.'+String(d.getMilliseconds()).padStart(3,'0')};
const hash=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)};
const gauss=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};

/* ---------- configuración ---------- */
const cfg={};
const IDS=['res','fps','codec','tr','hw','link','qos','vpct','qlim','fault','iperf','tcpn','cache','speed'];
function readCfg(){
  for(const k of IDS){const v=$('#'+k).value;cfg[k]=isNaN(+v)||k==='res'?v:+v}
  cfg.mls=$('#mls').checked;cfg.ipaf=$('#ipaf').checked||!!cfg.tosOverride;
  $('#vpctv').textContent=cfg.vpct;$('#iperfv').textContent=cfg.iperf;$('#tcpnv').textContent=cfg.tcpn;$('#cachev').textContent=cfg.cache;
  $('#vpct').disabled=cfg.qos==='fifo';
  const [w,h]=RES[cfg.res],br=w*h*cfg.fps*BPP[cfg.codec]/1e6;
  const hdr=cfg.tr==='udp'?1458/1400:1518/1448;
  $('#formula').textContent=`Bitrate estimado: ${w}×${h} × ${cfg.fps} FPS × ${nf(BPP[cfg.codec],3)} bits/píxel = ${nf(br,2)} Mbps · con cabeceras ≈ ${nf(br*hdr,2)} Mbps en el cable (si el servidor alcanza los ${cfg.fps} FPS).`;
  SR.video=Math.min(1,10/Math.max(1,br*1e6/11200));SR.iperf=Math.min(1,6/Math.max(1,cfg.iperf*1e6/12128));SR.tcp=Math.min(1,4/Math.max(1,cfg.link*1e6/12144));
}
function setForm(o){for(const k in o){const el=$('#'+k);if(!el)continue;if(el.type==='checkbox')el.checked=!!o[k];else el.value=String(o[k])}}

/* ---------- motor de eventos discretos ---------- */
let now=0,es=0;const HQ=[];
function at(t,f,a,b){const e={t,s:es++,f,a,b};let i=HQ.length;HQ.push(e);while(i){const j=(i-1)>>1,p=HQ[j];if(p.t<t||(p.t===t&&p.s<e.s))break;HQ[i]=p;i=j}HQ[i]=e}
function pop(){const top=HQ[0],last=HQ.pop(),n=HQ.length;if(n){let i=0;for(;;){const l=2*i+1;if(l>=n)break;const r=l+1;const c=(r<n&&(HQ[r].t<HQ[l].t||(HQ[r].t===HQ[l].t&&HQ[r].s<HQ[l].s)))?r:l;const x=HQ[c];if(x.t>last.t||(x.t===last.t&&x.s>last.s))break;HQ[i]=x;i=c}HQ[i]=last}return top}
function runTo(T){let k=0;while(HQ.length&&HQ[0].t<=T){const e=pop();now=e.t;e.f(e.a,e.b);if(++k>250000)return}now=T}

/* ---------- contadores ---------- */
let C,DR,LAT,SAMP,SER,ACL,NATT;
function zero(){C={vB:0,vPk:0,vDrop:0,eg:0,egW:0,egV:0,egI:0,egT:0,egO:0,frDisp:0,frBad:0,frLost:0,stall:0,enc:0,srvSkip:0,iTx:0,iRx:0,iDrop:0,tRx:0,retx:0,vRx:0};
  DR={};LAT=[];SAMP=[];SER=[];ACL={l10:0,l20:0};
  for(const c of ['V','D'])RS.st[c]={p:0,b:0,dp:0,db:0};
  for(const k in P){P[k].txB=0;P[k].txP=0}}

/* ---------- puertos y colas ---------- */
class Fifo{constructor(lim){this.lim=lim;this.q=[];this.b=0}
  enq(p,port){if(this.q.length>=this.lim){drop(p,'cola llena '+port.name,'nic');return false}p.tQ=now;this.q.push(p);this.b+=p.size;return true}
  deq(){const p=this.q.shift();if(p)this.b-=p.size;return p}}
class Port{constructor(name,rate,post,s,tag){this.name=name;this.rate=rate;this.post=post;this.s=s||new Fifo(4000);this.tag=!!tag;this.busy=false;this.txB=0;this.txP=0;this.onTx=null}
  enq(p){if(this.s.enq(p,this)&&!this.busy)this.tx()}
  tx(){const p=this.s.deq();if(!p){this.busy=false;return}this.busy=true;if(this===P.r20){p.tOut=now;p.qd=now-p.tQ}
    at(now+(p.size+20+(this.tag?4:0))*8/this.rate(),portDone,this,p)}}
function portDone(port,p){port.txB+=p.size;port.txP++;if(port.onTx)port.onTx(p);capture(port,p);at(now+port.post,next,p);port.tx()}
function next(p){const s=p.path[++p.hop];if(!s)return;if(s instanceof Port)s.enq(p);else s(p)}

/* Planificador de salida de G0/0.20 (shaper + FIFO / CBWFQ / LLQ) */
const RS={V:[],D:[],vb:0,db:0,cur:0,fresh:true,def:[0,0],tok:0,tokT:0,st:{V:{p:0,b:0,dp:0,db:0},D:{p:0,b:0,dp:0,db:0}},
  enq(p,port){const isV=cfg.qos!=='fifo'&&p.dscp===34,cls=isV?'V':'D',s=this.st[cls];s.p++;s.b+=p.size;
    if(isV&&cfg.qos==='llq'){const r=cfg.link*1e6*cfg.vpct/800;this.tok=Math.min(r*.2,this.tok+(now-this.tokT)*r);this.tokT=now;
      if(port.busy&&this.tok<p.size){s.dp++;s.db+=p.size;drop(p,'policía LLQ (clase VIDEO excede)','rtr');return false}this.tok-=p.size}
    const q=isV?this.V:this.D,lim=isV?64:cfg.qlim;
    if(q.length>=lim){s.dp++;s.db+=p.size;drop(p,isV?'cola VIDEO llena':'tail drop en G0/0.20','rtr');return false}
    p.tQ=now;p.cls=cls;q.push(p);if(isV)this.vb+=p.size;else this.db+=p.size;return true},
  deq(){let p;if(cfg.qos==='cbwfq')p=this.drr();else p=this.V.length?this.V.shift():this.D.shift();
    if(p){if(p.cls==='V')this.vb-=p.size;else this.db-=p.size}return p},
  drr(){const Q=[this.V,this.D];if(!Q[0].length&&!Q[1].length)return null;const w=[cfg.vpct,100-cfg.vpct],mn=Math.min(w[0],w[1]),qt=[1600*w[0]/mn,1600*w[1]/mn];
    for(let g=0;g<64;g++){const c=this.cur,q=Q[c];if(!q.length){this.def[c]=0;this.cur^=1;this.fresh=true;continue}
      if(this.fresh){this.def[c]+=qt[c];this.fresh=false}
      if(this.def[c]>=q[0].size){this.def[c]-=q[0].size;return q.shift()}this.cur^=1;this.fresh=true}
    return Q[0].shift()||Q[1].shift()},
  get n(){return this.V.length+this.D.length}};

const M=1e6;
const P={
  srv:new Port('Servidor → Fa0/1',()=>100*M,5e-6),
  ip10:new Port('PC iperf3 → Fa0/3',()=>100*M,5e-6),
  cli:new Port('Cliente → Fa0/2',()=>100*M,5e-6),
  up:new Port('Gi0/1 → R1 G0/0',()=>1000*M,40e-6,null,true),
  inet:new Port('ISP → G0/1',()=>100*M,60e-6),
  r20:new Port('G0/0.20 (salida)',()=>cfg.link*M,5e-6,RS,true),
  r10:new Port('G0/0.10 (salida)',()=>1000*M,5e-6,null,true),
  fa1:new Port('Fa0/1 → servidor',()=>100*M,1e-6),
  fa2:new Port('Fa0/2 → cliente',()=>100*M,1e-6),
  fa4:new Port('Fa0/4 → PC 20.11',()=>100*M,1e-6),
  fa5:new Port('Fa0/5 → PC 20.12',()=>100*M,1e-6)};
P.r20.onTx=p=>{C.eg+=p.size;C.egW+=p.size+24;if(p.flow==='video')C.egV+=p.size;else if(p.flow==='iperf')C.egI+=p.size;else if(p.flow==='tcp')C.egT+=p.size;else C.egO+=p.size};

/* ---------- switch y router ---------- */
const VLANP=()=>({'Fa0/1':10,'Fa0/2':cfg.fault==='client_vlan'?10:20,'Fa0/3':10,'Fa0/4':20,'Fa0/5':20});
function swIn(p){p.vlan=VLANP()[p.inP];if(cfg.mls&&p.inP!=='Fa0/1')p.dscp=0;next(p)}
function rtr(p){
  if(p.nat){p.preDst=p.dst+':'+p.dport;p.dst='192.168.20.12';p.dport=p.natPort}
  if(p.dst.startsWith('192.168.20.')){
    if(cfg.fault==='sub20_down')return drop(p,'sin ruta a 192.168.20.0/24 (G0/0.20 apagada)','rtr');
    if(cfg.fault==='client_vlan'&&p.dst==='192.168.20.10')return drop(p,'ARP incompleto para 192.168.20.10','rtr');
    if(p.proto==='RTP'&&p.src==='192.168.10.10'){ACL.l10++;if(cfg.fault==='acl_block')return drop(p,'ACL 120 línea 10 (deny udp)','rtr')}else ACL.l20++;
    p.vlan=20}else p.vlan=10;
  p.ttl--;next(p)}
function swTr(p){if(p.vlan===20&&cfg.fault==='trunk_no20')return drop(p,'VLAN 20 no permitida en la troncal','sw');next(p)}
function drop(p,why,where){p.dropped=why;p.dropAt=where;DR[why]=(DR[why]||0)+1;
  if(p.flow==='video')C.vDrop++;else if(p.flow==='iperf'){C.iDrop++;IPS.lost++}
  if(p.tcp)p.tcp.lost(p);if(p.onDrop)p.onDrop(p);return false}

/* ---------- paquetes ---------- */
let pid=0,rtpSeq=Math.floor(Math.random()*60000);
const pk=o=>{o.id=++pid;o.hop=-1;o.tS=now;o.ttl=o.ttl||64;return o};
const rxV=p=>{C.vRx++;const tr=now-p.fr.capT;if(cl.lt!==null){const d=Math.abs(tr-cl.lt);cl.J+=(d-cl.J)/16}cl.lt=tr;
  const f=p.fr;f.got++;if(f.got===f.n){f.tC=now;frameDone(f)}};
const rxI=p=>{C.iRx+=p.size;IPS.rx++;IPS.rxB+=p.size;const tr=now-p.tS;if(IPS.lt!==null)IPS.J+=(Math.abs(tr-IPS.lt)-IPS.J)/16;IPS.lt=tr};
const tcpRx=p=>p.tcp.rx(p);
const PATH={};
PATH.vu=[P.srv,swIn,P.up,rtr,P.r20,swTr,P.fa2,rxV];
PATH.vt=[P.srv,swIn,P.up,rtr,P.r20,swTr,P.fa2,tcpRx];
PATH.ip=[P.ip10,swIn,P.up,rtr,P.r20,swTr,P.fa4,rxI];
PATH.dl=[P.inet,rtr,P.r20,swTr,P.fa5,tcpRx];

/* ---------- TCP simplificado (slow start, AIMD, retransmisión) ---------- */
class Tcp{constructor(o){Object.assign(this,o);this.cwnd=10;this.ss=1e9;this.nx=0;this.inf=new Map();this.rq=[];this.srtt=this.ackD*2+.002;this.rec=-1;this.cum=0;this.rcv=new Set();this.frames=[];this.dead=false;if(this.app===undefined)this.app=Infinity}
  send(){if(this.dead)return;while(this.inf.size<Math.floor(this.cwnd)&&(this.rq.length||this.nx<this.app)){const s=this.rq.length?this.rq.shift():this.nx++;this.inf.set(s,now);const p=this.mk(s);p.tcp=this;p.seq=s;vis(p,this.flowKey);next(p)}}
  rx(p){if(this.dead&&this.kind==='dl')return;if(p.seq>=this.cum)this.rcv.add(p.seq);while(this.rcv.has(this.cum)){this.rcv.delete(this.cum);this.cum++}
    if(this.kind==='dl')C.tRx+=p.size;else{C.vRx++;while(this.frames.length&&this.frames[0].end<=this.cum){const f=this.frames.shift();f.tC=now;frameDone(f)}}
    at(now+this.ackD,tcpAck,this,p)}
  ack(p){if(!this.inf.has(p.seq))return;this.inf.delete(p.seq);const r=now-p.tS;this.srtt=.875*this.srtt+.125*r;
    this.cwnd+=this.cwnd<this.ss?1:1/this.cwnd;if(this.cwnd>this.max)this.cwnd=this.max;this.send()}
  lost(p){at(now+this.srtt*1.2+.001,tcpLoss,this,p.seq)}
  loss(s){if(!this.inf.has(s))return;this.inf.delete(s);if(now>this.rec){this.ss=Math.max(2,this.cwnd/2);this.cwnd=this.ss;this.rec=now+this.srtt}this.rq.push(s);if(this.kind!=='dl')C.retx++;this.send()}
  backlog(){return(this.app-this.cum)*1448}}
const tcpAck=(t,p)=>t.ack(p),tcpLoss=(t,s)=>t.loss(s);
const DLHOST=['151.101.1.69','142.250.78.14','104.16.132.229','13.107.42.14','157.240.6.35','23.45.110.8'];
const dl=[];
function setTcpFlows(n){while(dl.length<n){const i=dl.length,srcIp=DLHOST[i%6],port=50001+i*7;
    const f=new Tcp({kind:'dl',flowKey:'tcp',i,ackD:.015+Math.random()*.02,max:600,srcIp,port,
      mk:s=>pk({flow:'tcp',size:1518,dscp:0,src:srcIp,dst:'200.1.1.2',sport:443,dport:port,natPort:port,nat:true,proto:'TCP',inP:'G0/1',path:PATH.dl})});
    dl.push(f);at(now+.01*i,()=>f.send())}
  while(dl.length>n){dl.pop().dead=true}}
let tcpV=null;
function setTransport(){if(cfg.tr==='tcp'){if(!tcpV||tcpV.dead)tcpV=new Tcp({kind:'v',flowKey:'video',ackD:.00025,max:1000,app:0,
    mk:s=>{const p=pk({flow:'video',size:1518,dscp:34,src:'192.168.10.10',dst:'192.168.20.10',sport:5000,dport:51514,proto:'TCP',inP:'Fa0/1',path:PATH.vt});C.vB+=p.size;C.vPk++;return p}})}
  else if(tcpV){tcpV.dead=true;tcpV=null}}

/* ---------- servidor: captura → YOLOv8n → codificación ---------- */
const srv={busy:false,pending:null,encN:0,last:null,inf:0,lastT:0};
let fno=0;
function capTick(){const f={no:++fno,capT:now};if(srv.busy){if(srv.pending)C.srvSkip++;srv.pending=f}else startInf(f);at(now+1/cfg.fps,capTick)}
function startInf(f){srv.busy=true;const [w,h]=RES[cfg.res];const base=cfg.hw==='cpu'?46:9,sd=cfg.hw==='cpu'?6:1.2;
  const ms=Math.max(base*.6,base+gauss()*sd)+w*h/1e6*3;srv.inf=ms;at(now+ms/1000,infDone,f)}
function infDone(f){f.boxes=detect(f);srv.busy=false;if(srv.pending){const n=srv.pending;srv.pending=null;startInf(n)}
  const [w,h]=RES[cfg.res],px=w*h/1e6,enc={h264:3+px*6,h265:6+px*15,mjpeg:2+px*5}[cfg.codec];at(now+enc/1000,encDone,f)}
function encDone(f){const [w,h]=RES[cfg.res],codec=cfg.codec,G=cfg.fps,k=5,avg=w*h*BPP[codec]/8;
  f.codec=codec;f.tr=cfg.tr;f.I=codec==='mjpeg'||srv.encN%G===0;srv.encN++;
  const Pz=avg*G/(k+G-1);f.bytes=Math.round((codec==='mjpeg'?avg:(f.I?k*Pz:Pz))*(.85+Math.random()*.3));
  C.enc++;srv.last=f;
  if(f.tr==='tcp'&&tcpV){if(tcpV.backlog()>512e3){C.srvSkip++;return}
    const segs=Math.ceil(f.bytes/1448);f.end=tcpV.app+segs;tcpV.app+=segs;tcpV.frames.push(f);regFrame(f);tcpV.send();return}
  regFrame(f);sendUDP(f)}
function sendUDP(f){let rem=f.bytes;const n=Math.max(1,Math.ceil(rem/1400));f.n=n;f.got=0;const ts=Math.round(f.capT*90000)>>>0;
  for(let i=0;i<n;i++){const pl=Math.min(1400,rem);rem-=pl;
    const p=pk({flow:'video',size:pl+58,dscp:34,src:'192.168.10.10',dst:'192.168.20.10',sport:8000,dport:49152,proto:'RTP',seq:(rtpSeq++)&65535,ts,mk:i===n-1,fr:f,inP:'Fa0/1',path:PATH.vu});
    C.vB+=p.size;C.vPk++;vis(p,'video');next(p)}}

/* iperf3 UDP CBR */
const IPS={rx:0,rxB:0,lost:0,sent:0,J:0,lt:null};
function iperfTick(){if(cfg.iperf>0){const p=pk({flow:'iperf',size:1516,dscp:cfg.ipaf?34:0,src:'192.168.10.11',dst:'192.168.20.11',sport:43512,dport:5201,proto:'UDP',inP:'Fa0/3',path:PATH.ip,seq:IPS.sent++});
    C.iTx++;vis(p,'iperf');next(p);at(now+1516*8/(cfg.iperf*M),iperfTick)}else at(now+.05,iperfTick)}

/* ---------- cliente VLC: búfer de reproducción ---------- */
const cl={D:null,gen:0,pend:[],broken:true,shown:null,stall:false,J:0,lt:null};
function resetPlayer(){cl.gen++;cl.D=null;cl.pend=[];cl.broken=true;cl.stall=false;cl.lt=null}
function regFrame(f){f.gen=cl.gen;if(cl.D!==null)at(Math.max(now,f.capT+cl.D),playChk,f);else{cl.pend.push(f);if(cl.pend.length>400)cl.pend.shift()}}
function frameDone(f){if(cl.D===null&&f.gen===cl.gen&&(f.I||f.tr==='tcp')){cl.D=now-f.capT+cfg.cache/1000;for(const g of cl.pend)if(g.gen===cl.gen&&g.capT>=f.capT)at(Math.max(now,g.capT+cl.D),playChk,g);cl.pend=[]}}
function playChk(f){if(f.gen!==cl.gen)return;const due=f.capT+cl.D;if(due>now+1e-9){at(due,playChk,f);return}
  if(f.tr==='tcp'){if(!f.tC){cl.stall=true;cl.D+=.02;C.stall+=.02;at(f.capT+cl.D,playChk,f);return}cl.stall=false;show(f,false);return}
  if(!f.got){C.frLost++;cl.broken=true;return}
  if(f.codec==='mjpeg'){if(f.tC)show(f,false);else C.frLost++;return}
  if(f.tC&&(f.I||!cl.broken)){if(f.I)cl.broken=false;show(f,false)}else{if(!f.tC)C.frLost++;cl.broken=true;show(f,true)}}
function show(f,bad){cl.shown={f,bad,at:now};const lat=now+.012-(f.capT-.5/cfg.fps);LAT.push({t:now,v:lat*1000});if(LAT.length>3000)LAT.splice(0,1000);C.frDisp++;if(bad)C.frBad++}

/* ---------- escena y detecciones ---------- */
const OBJ=[{c:'persona',sp:.05,ph:.1,w:.045,h:.34,dir:1,span:1.35,cf:.85},{c:'persona',sp:.038,ph:.75,w:.045,h:.31,dir:-1,span:1.35,cf:.81},
  {c:'persona',sp:.028,ph:.3,w:.042,h:.29,dir:1,span:2.3,cf:.77},{c:'auto',sp:.11,ph:.4,w:.17,h:.17,dir:-1,span:1.9,cf:.87},{c:'perro',sp:.07,ph:.85,w:.085,h:.1,dir:1,span:1.6,cf:.8}];
function scene(t){return OBJ.map((o,i)=>{const u=((o.ph+o.sp*t)%o.span)-.2;const x=o.dir>0?u:1-o.w-u;return{...o,i,x,y:.82-o.h}}).filter(o=>o.x<1&&o.x+o.w>0)}
function detect(f){return scene(f.capT).map(o=>{const vis=(Math.min(1,o.x+o.w)-Math.max(0,o.x))/o.w;let cf=o.cf+(hash(f.no*7+o.i)-.5)*.12-(1-vis)*.5;
  const j=(hash(f.no*13+o.i)-.5)*.012;return{c:o.c,cf,x:o.x-.008+j,y:o.y-.01+j,w:o.w+.016,h:o.h+.02}}).filter(b=>b.cf>.45)}

/* ---------- muestreo de métricas ---------- */
const snap=()=>({t:now,...C,fa2:P.fa2.txB,up:P.up.txB,r20:P.r20.txB,srvb:P.srv.txB,Vb:RS.st.V.b,Vdb:RS.st.V.db,Db:RS.st.D.b,Ddb:RS.st.D.db,Vp:RS.st.V.p,Dp:RS.st.D.p,J:cl.J,q:qms()});
const qms=()=>(RS.vb+RS.db)*8/(cfg.link*M)*1000;
function sample(){const s=snap(),pr=SAMP[SAMP.length-1];SAMP.push(s);if(SAMP.length>400)SAMP.shift();
  if(pr){const dt=s.t-pr.t,mb=b=>b*8/dt/M,l=LAT.filter(x=>x.t>pr.t);
    SER.push({t:s.t,lat:l.length?l.reduce((a,x)=>a+x.v,0)/l.length:null,q:s.q,v:mb(s.egV-pr.egV),i:mb(s.egI-pr.egI),c:mb(s.egT-pr.egT+s.egO-pr.egO)});if(SER.length>240)SER.shift()}
  at(now+.25,sample)}
function win(sec){const e=SAMP[SAMP.length-1];if(!e)return null;let b=SAMP[0];for(let i=SAMP.length-1;i>=0;i--){if(SAMP[i].t<=e.t-sec){b=SAMP[i];break}}return diff(b,e)}
function diff(b,e){const dt=e.t-b.t||1e-9,d=k=>e[k]-b[k];const L=LAT.filter(x=>x.t>b.t&&x.t<=e.t).map(x=>x.v).sort((x,y)=>x-y);
  const qs=SER.filter(x=>x.t>b.t&&x.t<=e.t);
  return{dt,vbr:d('vB')*8/dt/M,util:d('egW')*8/dt/(cfg.link*M),loss:d('vPk')?d('vDrop')/d('vPk'):0,lat:L.length?L.reduce((a,x)=>a+x,0)/L.length:NaN,
    p95:L.length?L[Math.min(L.length-1,Math.floor(L.length*.95))]:NaN,jit:e.J*1000,fps:d('frDisp')/dt,bad:d('frBad'),q:qs.length?qs.reduce((a,x)=>a+x.q,0)/qs.length:e.q,
    enc:d('enc')/dt,retx:d('retx'),stall:d('stall'),Vr:d('Vb')*8/dt,Vd:d('Vdb')*8/dt,Dr:d('Db')*8/dt,Dd:d('Ddb')*8/dt,iperf:d('egI')*8/dt/M,tcp:d('tRx')*8/dt/M,
    port:k=>d(k)*8/dt}}

/* ---------- captura tipo Wireshark ---------- */
const CAP={on:true,tap:'fa2',rows:[],no:0,sel:null};
const MAC={'192.168.10.10':'00:50:56:a1:10:10','192.168.10.11':'00:50:56:a1:10:11','192.168.20.10':'00:50:56:a1:20:10','192.168.20.11':'00:50:56:a1:20:11','192.168.20.12':'00:50:56:a1:20:12',R:'00:d0:ba:11:00:01'};
function capture(port,p){if(!CAP.on)return;const t=CAP.tap;
  if(!((t==='fa2'&&port===P.fa2)||(t==='trunk'&&(port===P.up||port===P.r20))||(t==='fa1'&&port===P.srv)))return;
  CAP.rows.push({no:++CAP.no,t:now,port:port.name,tag:port.tag?p.vlan:null,after:port===P.r20||port===P.fa2,src:p.src,dst:p.dst,sport:p.sport,dport:p.dport,proto:p.proto==='TCP'&&p.flow==='video'?'HTTP':p.proto,
    len:p.size-4+(port.tag?4:0),dscp:p.dscp,ttl:p.ttl,p});
  if(CAP.rows.length>300)CAP.rows.splice(0,100)}
function info(r){const p=r.p;if(p.proto==='RTP')return`PT=96 ${CODN[p.fr.codec]}, SSRC=0x5a17c0de, Seq=${p.seq}, Time=${p.ts}${p.mk?', Mark':''}`;
  if(p.proto==='TCP'){const s=p.seq*1448+1;return`${p.sport} → ${p.dport} [ACK] Seq=${s} Len=1448${p.flow==='video'?' (multipart/x-mixed-replace)':''}`}
  if(p.proto==='UDP')return`${p.sport} → ${p.dport} Len=1470 (iperf3 #${p.seq})`;if(p.proto==='ICMP')return`Echo (ping) reply id=0x0001, seq=${p.icmpSeq}, ttl=${r.ttl}`;return''}
const DSCPN=d=>d===34?'AF41 (34)':d===0?'CS0 / BE (0)':String(d);
function inspect(r){const p=r.p,smac=r.after?MAC.R:(MAC[r.src]||'00:1a:2b:00:47:01'),dmac=r.after?(MAC[r.dst]||'00:50:56:a1:20:12'):MAC.R,l4=p.proto==='TCP'?'TCP':'UDP';
  let s=`Frame ${r.no}: ${r.len} bytes en ${r.port}\nEthernet II\n  Origen:  ${smac}\n  Destino: ${dmac}\n`;
  if(r.tag!=null)s+=`802.1Q Virtual LAN\n  PRI: ${p.dscp===34?4:0}  ID (VLAN): ${r.tag}\n`;
  s+=`Internet Protocol Version 4\n  Origen:  ${r.src}\n  Destino: ${r.dst}\n  DSCP: ${DSCPN(r.dscp)}   TTL: ${r.ttl}\n  Longitud total: ${p.size-18}\n`;
  if(p.preDst)s+=`  NAT: antes del router el destino era ${p.preDst}\n`;
  if(p.proto==='ICMP')s+=`ICMP Echo reply, seq ${p.icmpSeq}\n`;else s+=`${l4==='TCP'?'Transmission Control Protocol':'User Datagram Protocol'}\n  Puerto origen: ${r.sport}  Puerto destino: ${r.dport}\n`;
  if(p.proto==='RTP')s+=`Real-Time Transport Protocol\n  Seq: ${p.seq}  Timestamp: ${p.ts}  Marker: ${p.mk?1:0}\n  Cuadro ${p.fr.no} (${p.fr.I?'I':'P'}), ${p.fr.n} paquetes, ${nf(p.fr.bytes/1024,1)} KB\n`;
  s+=`\nTiempos del simulador\n  Enviado:  ${nf(p.tS,4)} s   Capturado: ${nf(r.t,4)} s\n`;
  if(p.qd!==undefined)s+=`  Espera en la cola G0/0.20: ${nf(p.qd*1000,2)} ms (clase ${p.cls==='V'?'VIDEO':'class-default'})\n`;
  s+=`  Tránsito hasta este punto: ${nf((r.t-p.tS)*1000,2)} ms`;$('#insp').textContent=s}

/* ---------- animación de paquetes (muestra) ---------- */
const SR={video:.1,iperf:.1,tcp:.1};const DOTS=[];
const ROUTE={video:[['srv','sw'],['sw','rtr','up'],['rtr','sw','dn'],['sw','cli']],iperf:[['ip10','sw'],['sw','rtr','up'],['rtr','sw','dn'],['sw','pc11']],tcp:[['inet','rtr'],['rtr','sw','dn'],['sw','pc12']]};
function vis(p,k){if(DOTS.length<420&&Math.random()<SR[k])DOTS.push({p,k,seg:0,pr:0,fall:0})}

/* ---------- colores desde CSS ---------- */
let K={};
function colors(){const pr=document.createElement('i');document.querySelector('.redsim').appendChild(pr);for(const v of ['bg','panel','ink','muted','line','teal','tealbg','vid','oth','tcp','bad','warn','scene','ground','fig']){pr.style.color=`var(--${v})`;K[v]=getComputedStyle(pr).color}pr.remove()}
function prep(cv){const r=cv.getBoundingClientRect(),d=window.devicePixelRatio||1,W=Math.max(1,r.width),H=Math.max(1,r.height);
  if(cv.width!==Math.round(W*d)||cv.height!==Math.round(H*d)){cv.width=Math.round(W*d);cv.height=Math.round(H*d)}const x=cv.getContext('2d');x.setTransform(d,0,0,d,0,0);return{x,W,H}}
function rr(x,a,b,w,h,r){x.beginPath();x.roundRect?x.roundRect(a,b,w,h,r):x.rect(a,b,w,h)}

/* ---------- dibujo de la topología ---------- */
const NODES={srv:{x:.16,y:.16,t:'Servidor YOLO',s:'192.168.10.10 · VLAN 10',dev:'R1'},ip10:{x:.16,y:.5,t:'PC iperf3 -c',s:'192.168.10.11 · VLAN 10',dev:'PC-iperf'},
  adm:{x:.16,y:.84,t:'PC gestión',s:'192.168.99.10 · VLAN 99',dev:'SW1'},sw:{x:.5,y:.7,t:'SW1 · Cisco 2960',s:'802.1Q · mls qos',dev:'SW1'},
  rtr:{x:.5,y:.16,t:'R1 · router-on-a-stick',s:'NAT · ACL · QoS',dev:'R1'},inet:{x:.84,y:.16,t:'Internet (ISP)',s:'200.1.1.1',dev:'R1'},
  cli:{x:.84,y:.45,t:'Cliente VLC',s:'192.168.20.10 · VLAN 20',dev:'PC-Cliente'},pc11:{x:.84,y:.67,t:'PC iperf3 -s',s:'192.168.20.11 · VLAN 20',dev:'PC-iperf'},
  pc12:{x:.84,y:.89,t:'PC descargas',s:'192.168.20.12 · VLAN 20',dev:'PC-Cliente'}};
const NSM={rtr:[.27,.07],inet:[.75,.07],sw:[.27,.52],srv:[.73,.24],ip10:[.73,.37],adm:[.73,.5],cli:[.73,.63],pc11:[.73,.76],pc12:[.73,.89]};
let TL={};
function topo(dt){const cv=$('#ctopo'),{x,W,H}=prep(cv);x.clearRect(0,0,W,H);const sm=W<640,bw=sm?Math.min(178,W*.44):Math.min(178,W*.25),bh=sm?38:46,fs=sm?10:12;
  const N={};for(const k in NODES){const q=sm?NSM[k]:[NODES[k].x,NODES[k].y];N[k]={...NODES[k],X:q[0]*W,Y:q[1]*H}}TL={N,bw,bh};
  const lane=(a,b,o)=>[[a.X+o,a.Y],[b.X+o,b.Y]];const UP=-12,DN=12;
  const seg=([a,b,l])=>l==='up'?lane(N.sw,N.rtr,UP):l==='dn'?lane(N.rtr,N.sw,DN):[[N[a].X,N[a].Y],[N[b].X,N[b].Y]];
  x.lineWidth=2;x.strokeStyle=K.line;
  const L=(a,b)=>{x.beginPath();x.moveTo(a[0],a[1]);x.lineTo(b[0],b[1]);x.stroke()};
  for(const [a,b] of [['srv','sw'],['ip10','sw'],['adm','sw'],['sw','cli'],['sw','pc11'],['sw','pc12'],['rtr','inet']])L([N[a].X,N[a].Y],[N[b].X,N[b].Y]);
  x.lineWidth=3;const u=lane(N.sw,N.rtr,UP),d=lane(N.rtr,N.sw,DN);L(u[0],u[1]);x.strokeStyle=K.teal;L(d[0],d[1]);
  x.font=`${fs}px "IBM Plex Mono",monospace`;x.fillStyle=K.muted;x.textAlign='right';const my=(N.sw.Y+N.rtr.Y)/2;
  x.fillText(sm?'↑ V10':'↑ VLAN 10 · 1 Gbps',N.sw.X+UP-8,my);x.textAlign='left';x.fillStyle=K.teal;x.fillText(sm?`↓ V20 ${cfg.link}M`:`↓ VLAN 20 · shape ${cfg.link} Mbps`,N.sw.X+DN+8,my);
  x.fillStyle=K.muted;if(!sm)x.fillText('troncal 802.1Q Gi0/1 ↔ G0/0',N.sw.X+DN+8,my+fs+4);
  const pl=(a,txt,off=.3)=>{const A=N[a],B=N.sw;x.textAlign='center';x.fillText(txt,B.X+(A.X-B.X)*off,B.Y+(A.Y-B.Y)*off-5)};
  if(!sm){x.fillStyle=K.muted;pl('srv','Fa0/1');pl('ip10','Fa0/3');pl('adm','Fa0/10');pl('cli','Fa0/2');pl('pc11','Fa0/4');pl('pc12','Fa0/5');
    x.textAlign='center';x.fillText('G0/1 · NAT · 100M',(N.rtr.X+N.inet.X)/2,N.rtr.Y-8)}
  /* fallas */
  const X=(px,py,lbl)=>{x.strokeStyle=K.bad;x.lineWidth=3;x.beginPath();x.moveTo(px-7,py-7);x.lineTo(px+7,py+7);x.moveTo(px+7,py-7);x.lineTo(px-7,py+7);x.stroke();x.fillStyle=K.bad;x.font=`700 ${fs}px "IBM Plex Mono",monospace`;x.textAlign='center';x.fillText(lbl,px,py+20)};
  if(cfg.fault==='client_vlan')X((N.sw.X+N.cli.X)/2,(N.sw.Y+N.cli.Y)/2,'Fa0/2 en VLAN 10');
  if(cfg.fault==='trunk_no20')X(N.sw.X+DN,N.sw.Y-bh/2-22,'VLAN 20 no permitida');
  if(cfg.fault==='sub20_down')X(N.rtr.X+DN,N.rtr.Y+bh/2+18,'G0/0.20 shutdown');
  if(cfg.fault==='acl_block')X(N.rtr.X+DN+40,N.rtr.Y+bh/2+18,'ACL 120 deny');
  /* paquetes */
  const col={video:K.vid,iperf:K.oth,tcp:K.tcp},SEGT=.42;
  for(let i=DOTS.length-1;i>=0;i--){const o=DOTS[i],r=ROUTE[o.k];let [a,b]=seg(r[o.seg]);
    if(o.fall){o.fall+=dt;const t=o.fall;x.globalAlpha=Math.max(0,1-t/1.1);x.fillStyle=K.bad;x.beginPath();x.arc(o.fx+t*14,o.fy+t*t*140,4.5,0,7);x.fill();x.globalAlpha=1;if(t>1.1)DOTS.splice(i,1);continue}
    o.pr+=dt/SEGT;
    if(o.pr>=1){const end=r[o.seg][1],p=o.p;
      if(end==='rtr'&&!p.dropped&&p.tOut===undefined){o.pr=1}
      else if((end==='rtr'&&p.dropped&&p.dropAt==='rtr')||(end==='sw'&&r[o.seg][2]==='dn'&&p.dropped&&p.dropAt==='sw')){o.fall=.001;o.fx=b[0];o.fy=b[1];continue}
      else if(o.seg+1>=r.length){DOTS.splice(i,1);continue}else{o.seg++;o.pr=0;[a,b]=seg(r[o.seg])}}
    const pr=Math.min(1,o.pr);x.fillStyle=col[o.k];x.beginPath();x.arc(a[0]+(b[0]-a[0])*pr,a[1]+(b[1]-a[1])*pr,4.5,0,7);x.fill()}
  /* nodos */
  for(const k in N){const n=N[k],w=k==='inet'?bw*.8:bw;x.fillStyle=K.panel;x.strokeStyle=k==='sw'||k==='rtr'?K.teal:K.line;x.lineWidth=2;rr(x,n.X-w/2,n.Y-bh/2,w,bh,8);x.fill();x.stroke();
    x.fillStyle=K.ink;x.textAlign='center';x.font=`700 ${fs+1}px "IBM Plex Sans",sans-serif`;x.fillText(n.t,n.X,n.Y-(sm?1:3));x.fillStyle=K.muted;x.font=`${fs-1}px "IBM Plex Mono",monospace`;x.fillText(n.s,n.X,n.Y+(sm?11:13))}
  if(!sm){const s=N.srv;x.fillStyle=K.fig;rr(x,s.X-bw/2-30,s.Y-9,18,14,3);x.fill();x.beginPath();x.arc(s.X-bw/2-21,s.Y-2,4,0,7);x.fillStyle=K.panel;x.fill();x.strokeStyle=K.line;x.beginPath();x.moveTo(s.X-bw/2-12,s.Y);x.lineTo(s.X-bw/2,s.Y);x.stroke()}
  /* cola dentro del router */
  const qn=RS.n,lim=cfg.qos==='fifo'?cfg.qlim:cfg.qlim+64,qw=Math.min(bw*.9,150),qx=N.rtr.X-qw/2,qy=N.rtr.Y+bh/2+6;
  x.fillStyle=K.tealbg;x.fillRect(qx,qy,qw,7);x.fillStyle=qn/lim>.85?K.bad:K.vid;x.fillRect(qx,qy,qw*Math.min(1,qn/lim),7)}

/* ---------- dibujo del video ---------- */
function drawScene(cv,t,boxes,o){const {x,W,H}=prep(cv);x.fillStyle=K.scene;x.fillRect(0,0,W,H);
  const g=.82*H;x.fillStyle=K.ground;x.fillRect(0,g,W,H-g);x.strokeStyle=K.fig;x.globalAlpha=.6;x.setLineDash([14,10]);x.lineWidth=2;x.beginPath();x.moveTo(0,g+(H-g)*.45);x.lineTo(W,g+(H-g)*.45);x.stroke();x.setLineDash([]);x.globalAlpha=1;
  x.fillStyle=K.fig;
  for(const ob of scene(t)){const X=ob.x*W,Y=ob.y*H,w=ob.w*W,h=ob.h*H;
    if(ob.c==='persona'){const bob=Math.sin(t*8+ob.i)*1.5;x.beginPath();x.arc(X+w/2,Y+w*.45+bob,w*.42,0,7);x.fill();rr(x,X+w*.12,Y+w*1.05+bob,w*.76,h-w*1.05,w*.25);x.fill()}
    else if(ob.c==='auto'){rr(x,X,Y+h*.35,w,h*.5,8);x.fill();rr(x,X+w*.22,Y,w*.52,h*.45,10);x.fill();x.fillStyle=K.ink;for(const q of [.22,.78]){x.beginPath();x.arc(X+w*q,Y+h*.87,h*.15,0,7);x.fill()}x.fillStyle=K.fig}
    else{x.beginPath();x.ellipse(X+w*.45,Y+h*.6,w*.4,h*.3,0,0,7);x.fill();x.beginPath();x.arc(X+w*.85,Y+h*.32,h*.22,0,7);x.fill()}}
  const fs=Math.max(10,W/52);x.lineWidth=2;
  for(const b of boxes||[]){x.strokeStyle=K.vid;x.strokeRect(b.x*W,b.y*H,b.w*W,b.h*H);const lb=`${b.c} ${b.cf.toFixed(2)}`;x.font=`600 ${fs}px "IBM Plex Mono",monospace`;const tw=x.measureText(lb).width+8;
    x.fillStyle=K.vid;x.fillRect(b.x*W-1,b.y*H-fs-6,tw,fs+6);x.fillStyle='#fff';x.textAlign='left';x.fillText(lb,b.x*W+3,b.y*H-5)}
  if(o.bad){for(let i=0;i<14;i++){const r=hash(o.seed*31+i),r2=hash(o.seed*17+i*3),bx=Math.floor(r*16)*W/16,by=Math.floor(r2*9)*H/9,bwid=W/16*(1+Math.floor(hash(i+o.seed)*3));
      try{x.drawImage(cv,bx*cv.width/W,by*cv.height/H,bwid*cv.width/W,H/9*cv.height/H,bx+(r-.5)*W*.08,by,bwid,H/9)}catch(e){}x.fillStyle=`rgba(60,160,90,${.15+r2*.25})`;x.fillRect(bx,by,bwid,H/9)}}
  x.font=`600 ${fs*1.1}px "IBM Plex Mono",monospace`;const per=(boxes||[]).filter(b=>b.c==='persona').length,tag=`personas: ${per}`;
  x.fillStyle=K.panel;rr(x,10,10,x.measureText(tag).width+20,fs*2.2,6);x.fill();x.fillStyle=K.ink;x.textAlign='left';x.fillText(tag,20,10+fs*1.45);
  x.font=`600 ${fs}px "IBM Plex Mono",monospace`;x.fillStyle='rgba(0,0,0,.55)';const ck=clock(o.cap),cw=x.measureText(ck).width+12;x.fillRect(8,H-fs*2.1-6,cw,fs*2);x.fillStyle='#fff';x.fillText(ck,14,H-fs*.75-6);
  if(o.right){x.textAlign='right';x.font=`600 ${fs}px "IBM Plex Mono",monospace`;const tw=x.measureText(o.right).width+20;x.fillStyle=o.rc||K.panel;rr(x,W-tw-10,10,tw,fs*2.2,6);x.fill();x.fillStyle=o.rc?'#fff':K.ink;x.fillText(o.right,W-20,10+fs*1.45)}
  if(o.msg){x.fillStyle='rgba(0,0,0,.55)';x.fillRect(0,H/2-fs*1.6,W,fs*3.2);x.fillStyle='#fff';x.textAlign='center';x.font=`700 ${fs*1.3}px "IBM Plex Sans",sans-serif`;x.fillText(o.msg,W/2,H/2+fs*.45)}}
function drawVideos(){const s=srv.last;
  if(s)drawScene($('#vsrv'),s.capT,s.boxes,{cap:s.capT,right:'EN VIVO ●'});else drawScene($('#vsrv'),now,[],{cap:now,msg:'iniciando captura…'});
  const sh=cl.shown;let msg=null;
  if(!sh||cl.D===null){msg=cfg.fault!=='none'?'sin señal: no llegan paquetes':'esperando video… (llenando el búfer)'}
  else if(now-sh.at>.5)msg=cl.stall?'búfer vacío: VLC detenido':'imagen congelada';
  if(sh)drawScene($('#vcli'),sh.f.capT,sh.f.boxes,{cap:sh.f.capT,bad:sh.bad,seed:sh.f.no,right:`retardo ${Math.round((now-sh.f.capT)*1000)} ms`,msg});
  else drawScene($('#vcli'),0,[],{cap:now,msg})}

/* ---------- gráficas ---------- */
function nice(v){const p=10**Math.floor(Math.log10(v||1)),m=v/p;return(m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p}
function axes(x,W,H,ymax,unit){const l=46,r=10,t=10,b=22;x.font='11px "IBM Plex Mono",monospace';x.strokeStyle=K.line;x.fillStyle=K.muted;x.lineWidth=1;x.textAlign='right';
  for(let i=0;i<=4;i++){const y=t+(H-t-b)*(1-i/4);x.beginPath();x.moveTo(l,y);x.lineTo(W-r,y);x.stroke();x.fillText(nf(ymax*i/4,ymax<10?1:0)+(i===4?' '+unit:''),l-4,y+4)}
  x.textAlign='center';for(let s=0;s<=40;s+=10)x.fillText(s?`-${s} s`:'ahora',W-r-(W-l-r)*s/40,H-6);return{l,r,t,b,X:tt=>l+(W-l-r)*(1-(now-tt)/40),Y:v=>t+(H-t-b)*(1-v/ymax)}}
function charts(){{const {x,W,H}=prep($('#ch1'));x.clearRect(0,0,W,H);const S=SER.filter(s=>s.t>now-40);let mx=50;for(const s of S){if(s.lat!=null)mx=Math.max(mx,s.lat);mx=Math.max(mx,s.q)}
  const a=axes(x,W,H,nice(mx*1.1),'ms');const line=(k,c,dash)=>{x.strokeStyle=c;x.lineWidth=2;x.setLineDash(dash||[]);x.beginPath();let st=false;for(const s of S){if(s[k]==null){st=false;continue}const X=a.X(s.t),Y=a.Y(s[k]);st?x.lineTo(X,Y):x.moveTo(X,Y);st=true}x.stroke();x.setLineDash([])};
  line('q',K.teal,[5,4]);line('lat',K.vid)}
  {const {x,W,H}=prep($('#ch2'));x.clearRect(0,0,W,H);const S=SER.filter(s=>s.t>now-40);let mx=cfg.link*1.15;for(const s of S)mx=Math.max(mx,s.v+s.i+s.c);
  const a=axes(x,W,H,nice(mx),'Mbps');const area=(f0,f1,c)=>{if(S.length<2)return;x.fillStyle=c;x.beginPath();S.forEach((s,i)=>{const X=a.X(s.t),Y=a.Y(f1(s));i?x.lineTo(X,Y):x.moveTo(X,Y)});for(let i=S.length-1;i>=0;i--)x.lineTo(a.X(S[i].t),a.Y(f0(S[i])));x.closePath();x.fill()};
  x.globalAlpha=.85;area(()=>0,s=>s.v,K.vid);area(s=>s.v,s=>s.v+s.i,K.oth);area(s=>s.v+s.i,s=>s.v+s.i+s.c,K.tcp);x.globalAlpha=1;
  x.strokeStyle=K.bad;x.setLineDash([6,4]);x.lineWidth=1.5;x.beginPath();x.moveTo(a.l,a.Y(cfg.link));x.lineTo(W-a.r,a.Y(cfg.link));x.stroke();x.setLineDash([])}}

/* ---------- paneles HTML ---------- */
function panels(){const w=win(2);if(!w)return;const lv=(v,a,b)=>v>b?'bad':v>a?'warn':'ok';const base=cfg.cache;
  const items=[['Bitrate del video',nf(w.vbr,2)+' Mbps',''],['Carga del enlace',Math.round(w.util*100)+' %',lv(w.util,.8,.97)],['Pérdida de video',nf(w.loss*100,1)+' %',w.loss>.02?'bad':w.loss>0?'warn':'ok'],
    ['Latencia media',isNaN(w.lat)?'—':Math.round(w.lat)+' ms',isNaN(w.lat)?'bad':lv(w.lat,base+120,base+300)],['Latencia p95',isNaN(w.p95)?'—':Math.round(w.p95)+' ms',''],['Jitter RTP',nf(w.jit,2)+' ms',lv(w.jit,5,20)],
    ['FPS en el cliente',nf(w.fps,1),w.fps<w.enc*.9?'warn':'ok'],['Cola G0/0.20',nf(w.q,1)+' ms',lv(w.q,20,80)]];
  if(cfg.tr==='tcp')items.push(['Retransmisiones',String(w.retx),w.retx?'warn':'ok']);else items.push(['Cuadros dañados',String(w.bad),w.bad?'bad':'ok']);
  $('#kpis').innerHTML=items.map(([a,b,c])=>`<div class="kpi ${c}"><span>${a}</span><b>${b}</b></div>`).join('');
  const qr=(n,lb,len,lim,cls)=>`<div class="qrow"><span>${lb}</span><div class="qbar ${cls}"><i style="width:${Math.min(100,len/lim*100)}%"></i></div><span class="mono">${len}/${lim} paq.</span></div>`;
  $('#queues').innerHTML=cfg.qos==='fifo'?qr(0,'Cola única FIFO (G0/0.20)',RS.D.length+RS.V.length,cfg.qlim,'d'):
    qr(0,`Clase VIDEO · ${cfg.qos==='llq'?'priority':'bandwidth'} ${cfg.vpct} %`,RS.V.length,64,'')+qr(0,'class-default',RS.D.length,cfg.qlim,'d');
  const dr=Object.entries(DR).sort((a,b)=>b[1]-a[1]).slice(0,4);$('#drops').textContent=dr.length?'Descartes desde el último reinicio: '+dr.map(([k,v])=>`${k} ×${v}`).join(' · '):'Sin descartes desde el último reinicio.';
  const s=srv.last;$('#capsrv').textContent=s?`YOLOv8n ${Math.round(srv.inf)} ms/cuadro · ${nf(w.enc,1)} FPS efectivos de ${cfg.fps} · último cuadro ${s.I?'I':'P'} de ${nf(s.bytes/1024,1)} KB`:'';
  $('#capcli').textContent=`reloj real ${clock(now)} · ${cfg.tr==='udp'?'RTP/UDP':'HTTP/TCP'} · búfer ${cfg.cache} ms · ${cl.D===null?'sin reproducir':cl.stall?'rebuffering':'reproduciendo'}`;
  if(CAP.on){const rows=CAP.rows.slice(-14).reverse();$('#captbl').innerHTML=rows.map(r=>`<tr data-no="${r.no}" class="p-${r.p.flow}${CAP.sel===r.no?' sel':''}"><td class="n">${r.no}</td><td class="n">${nf(r.t,4)}</td><td>${r.src}</td><td>${r.dst}</td><td>${r.proto}${r.tag!=null?' · v'+r.tag:''}</td><td class="n">${r.len}</td><td>${info(r)}</td></tr>`).join('')}}

/* ---------- consola ---------- */
const DEV={'R1':{pr:'R1#'},'SW1':{pr:'SW1#'},'PC-Cliente':{pr:'C:\\>'},'PC-iperf':{pr:'alumno@pc-iperf:~$'}};let dev='R1';const tout=$('#tout');
const TB={};const out=(s,d=dev)=>{TB[d]=(TB[d]||'')+s;if(TB[d].length>40000)TB[d]=TB[d].slice(-30000);if(d===dev){tout.textContent=TB[d];tout.scrollTop=tout.scrollHeight}};
function tabs(){$('#devtabs').innerHTML=Object.keys(DEV).map(d=>`<button type="button" data-dev="${d}" aria-pressed="${d===dev}">${d}</button>`).join('');$('#tprompt').textContent=DEV[dev].pr;tout.textContent=TB[dev]||'';tout.scrollTop=tout.scrollHeight}
function mt(c,pat){const a=c.split(' '),b=pat.split(' ');if(a.length<b.length)return null;for(let i=0;i<b.length;i++){if(b[i]==='*')continue;if(!b[i].startsWith(a[i]))return null}return a.slice(b.length)}
const kbps=b=>Math.round(b);
function runCmd(raw){const c=raw.trim().toLowerCase().replace(/\s+/g,' ');out(DEV[dev].pr+' '+raw+'\n');if(!c)return;
  if(c==='?'||c==='help'||c==='ayuda')return out(HELP[dev]+'\n');
  if(c==='clear'||c==='cls'){TB[dev]='';tout.textContent='';return}
  let a;
  if((a=mt(c,'ping'))&&a.length)return ping(a[0]);
  if(dev==='R1'){
    if(mt(c,'show ip interface brief'))return out(rIntBr());
    if(mt(c,'show ip route'))return out(rRoute());
    if(mt(c,'show running-config'))return out(rRun());
    if(mt(c,'show policy-map interface'))return out(rPol());
    if(mt(c,'show ip nat translations'))return out(rNat());
    if(mt(c,'show access-lists'))return out(rAcl());
    if((a=mt(c,'traceroute'))&&a.length)return out(trace(a[0]));
  }else if(dev==='SW1'){
    if(mt(c,'show vlan brief'))return out(sVlan());
    if(mt(c,'show interfaces trunk'))return out(sTrunk());
    if(mt(c,'show mac address-table'))return out(sMac());
    if(mt(c,'show running-config'))return out(sRun());
    if((a=mt(c,'show mls qos interface'))&&a.length)return out(sMls(a.join('')));
    if((a=mt(c,'show interfaces'))&&a.length)return out(sInt(a.join('')));
  }else{
    if(c==='ipconfig'||c==='ip a'||c==='ifconfig')return out(ipcfg());
    if((a=mt(c,'tracert'))&&a.length||(a=mt(c,'traceroute'))&&a.length)return out(trace(a[0]));
    if(dev==='PC-Cliente'&&c==='arp -a')return out(arpA());
    if(dev==='PC-iperf'&&c.startsWith('iperf3'))return iperfCmd(c);
  }
  out(dev.startsWith('PC')?`"${raw}" no se reconoce como un comando. Escriba ? para ver la lista.\n`:`% Invalid input detected. Escriba ? para ver los comandos simulados.\n`)}
const HELP={'R1':'show ip interface brief\nshow ip route\nshow running-config\nshow policy-map interface\nshow ip nat translations\nshow access-lists\nping <ip>   traceroute <ip>',
  'SW1':'show vlan brief\nshow interfaces trunk\nshow mac address-table\nshow running-config\nshow mls qos interface fa0/1 | fa0/3\nshow interfaces fa0/1 | fa0/2 | gi0/1\nping <ip>',
  'PC-Cliente':'ipconfig\nping <ip>   (192.168.10.10, 192.168.20.1, 8.8.8.8 …)\ntracert <ip>\narp -a','PC-iperf':'ipconfig\nping <ip>\ntraceroute <ip>\niperf3 -c 192.168.20.11 -u -b 15M [-t 10] [--tos 136]'};
const f20=()=>cfg.fault;
function rIntBr(){const d=f20()==='sub20_down';return`Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     unassigned      YES unset  up                    up
GigabitEthernet0/0.10  192.168.10.1    YES manual up                    up
GigabitEthernet0/0.20  192.168.20.1    YES manual ${d?'administratively down  down':'up                    up  '}
GigabitEthernet0/0.99  192.168.99.1    YES manual up                    up
GigabitEthernet0/1     200.1.1.2       YES manual up                    up
`}
function rRoute(){return`Codes: L - local, C - connected, S - static, * - candidate default

Gateway of last resort is 200.1.1.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 200.1.1.1
C        192.168.10.0/24 is directly connected, GigabitEthernet0/0.10
L        192.168.10.1/32 is directly connected, GigabitEthernet0/0.10
${f20()==='sub20_down'?'':`C        192.168.20.0/24 is directly connected, GigabitEthernet0/0.20
L        192.168.20.1/32 is directly connected, GigabitEthernet0/0.20
`}C        192.168.99.0/24 is directly connected, GigabitEthernet0/0.99
C        200.1.1.0/30 is directly connected, GigabitEthernet0/1
`}
function polCfg(){const q=cfg.qos;let s=`class-map match-any VIDEO
 match dscp af41
!
`;if(q!=='fifo')s+=`policy-map HIJO
 class VIDEO
  ${q==='llq'?'priority percent':'bandwidth percent'} ${cfg.vpct}
 class class-default
  queue-limit ${cfg.qlim} packets
!
`;s+=`policy-map SHAPE-${cfg.link}M
 class class-default
  shape average ${cfg.link*1000000}
${q!=='fifo'?'  service-policy HIJO\n':`  queue-limit ${cfg.qlim} packets\n`}!
`;return s}
function rRun(){return`hostname R1
!
${polCfg()}interface GigabitEthernet0/0
 no ip address
 no shutdown
!
interface GigabitEthernet0/0.10
 description VLAN10-SERVIDOR
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
 ip nat inside
!
interface GigabitEthernet0/0.20
 description VLAN20-CLIENTES
 encapsulation dot1Q 20
 ip address 192.168.20.1 255.255.255.0
 ip access-group 120 out
 ip nat inside
 service-policy output SHAPE-${cfg.link}M
${f20()==='sub20_down'?' shutdown\n':''}!
interface GigabitEthernet0/0.99
 description VLAN99-GESTION
 encapsulation dot1Q 99 native
 ip address 192.168.99.1 255.255.255.0
!
interface GigabitEthernet0/1
 description ISP
 ip address 200.1.1.2 255.255.255.252
 ip nat outside
!
access-list 1 permit 192.168.0.0 0.0.255.255
access-list 120 ${f20()==='acl_block'?'deny  ':'permit'} udp host 192.168.10.10 ${f20()==='acl_block'?'':'eq 8000 '}192.168.20.0 0.0.0.255
access-list 120 permit ip any any
ip nat inside source list 1 interface GigabitEthernet0/1 overload
ip route 0.0.0.0 0.0.0.0 200.1.1.1
end
`}
function rPol(){const w=win(5)||{Vr:0,Vd:0,Dr:0,Dd:0},st=RS.st,tot={p:st.V.p+st.D.p,b:st.V.b+st.D.b,dp:st.V.dp+st.D.dp},q=cfg.qos,L=cfg.link*1e6;
  const cm=(name,s,rate,drop,depth,lim,extra,match)=>`
        Class-map: ${name} (match-any)
          ${s.p} packets, ${s.b} bytes
          5 second offered rate ${kbps(rate)} bps, drop rate ${kbps(drop)} bps
          Match: ${match}
          Queueing
          queue limit ${lim} packets
          (queue depth/total drops/no-buffer drops) ${depth}/${s.dp}/0
          (pkts output/bytes output) ${s.p-s.dp-depth}/${s.b-s.db}
${extra}`;
  let s=` GigabitEthernet0/0.20

  Service-policy output: SHAPE-${cfg.link}M

    Class-map: class-default (match-any)
      ${tot.p} packets, ${tot.b} bytes
      5 second offered rate ${kbps(w.Vr+w.Dr)} bps, drop rate ${kbps(w.Vd+w.Dd)} bps
      Match: any
      shape (average) cir ${L}, bc ${L/250}, be ${L/250}
      target shape rate ${L}
`;
  if(q==='fifo')s+=`      queue limit ${cfg.qlim} packets
      (queue depth/total drops/no-buffer drops) ${RS.n}/${tot.dp}/0
`;else s+=`
      Service-policy : HIJO
${cm('VIDEO',st.V,w.Vr,w.Vd,RS.V.length,64,q==='llq'?`          Priority: ${cfg.vpct}% (${L*cfg.vpct/100000} kbps), burst bytes ${L*cfg.vpct/100/8*.2}\n`:`          bandwidth ${cfg.vpct}% (${L*cfg.vpct/100000} kbps)\n`,'dscp af41 (34)')}${cm('class-default',st.D,w.Dr,w.Dd,RS.D.length,cfg.qlim,'','any')}`;
  return s}
function rNat(){let s='Pro Inside global         Inside local          Outside local         Outside global\n';
  for(const f of dl)s+=`tcp 200.1.1.2:${f.port}     192.168.20.12:${f.port} ${pad(f.srcIp+':443',21)} ${f.srcIp}:443\n`;
  if(pingNat)s+=`icmp 200.1.1.2:1          192.168.20.10:1       8.8.8.8:1             8.8.8.8:1\n`;
  return dl.length||pingNat?s:s+'(sin traducciones activas: suba "Descargas TCP por NAT")\n'}
function rAcl(){return`Standard IP access list 1
    10 permit 192.168.0.0, wildcard bits 0.0.255.255
Extended IP access list 120
    10 ${f20()==='acl_block'?'deny udp host 192.168.10.10 192.168.20.0 0.0.0.255':'permit udp host 192.168.10.10 eq 8000 192.168.20.0 0.0.0.255'} (${ACL.l10} matches)
    20 permit ip any any (${ACL.l20} matches)
`}
function sVlan(){const cv=f20()==='client_vlan';return`VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Fa0/6, Fa0/7, Fa0/8, Fa0/9, Fa0/11
                                                Fa0/12 … Fa0/24, Gi0/2
10   SERVIDOR                         active    Fa0/1, Fa0/3${cv?', Fa0/2':''}
20   CLIENTES                         active    ${cv?'':'Fa0/2, '}Fa0/4, Fa0/5
99   GESTION                          active    Fa0/10
`}
function sTrunk(){const al=f20()==='trunk_no20'?'10,99':'10,20,99';return`Port        Mode         Encapsulation  Status        Native vlan
Gi0/1       on           802.1q         trunking      99

Port        Vlans allowed on trunk
Gi0/1       ${al}

Port        Vlans allowed and active in management domain
Gi0/1       ${al}

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/1       ${al}
`}
function sMac(){const cv=f20()==='client_vlan';return`          Mac Address Table
-------------------------------------------
Vlan    Mac Address       Type        Ports
----    -----------       --------    -----
  10    0050.56a1.1010    DYNAMIC     Fa0/1
  10    0050.56a1.1011    DYNAMIC     Fa0/3
  10    00d0.ba11.0001    DYNAMIC     Gi0/1
${cv?'  10    0050.56a1.2010    DYNAMIC     Fa0/2\n':''}  20    00d0.ba11.0001    DYNAMIC     Gi0/1
${cv?'':'  20    0050.56a1.2010    DYNAMIC     Fa0/2\n'}  20    0050.56a1.2011    DYNAMIC     Fa0/4
  20    0050.56a1.2012    DYNAMIC     Fa0/5
  99    0050.56a1.9910    DYNAMIC     Fa0/10
Total Mac Addresses for this criterion: ${cfg.tcpn>=0?9:9}
`}
function sRun(){const cv=f20()==='client_vlan';return`hostname SW1
!
${cfg.mls?'mls qos\n!\n':''}vlan 10
 name SERVIDOR
vlan 20
 name CLIENTES
vlan 99
 name GESTION
!
interface FastEthernet0/1
 description Servidor YOLO
 switchport mode access
 switchport access vlan 10
 mls qos trust dscp
interface FastEthernet0/2
 description Cliente VLC
 switchport mode access
 switchport access vlan ${cv?10:20}
interface FastEthernet0/3
 description PC iperf3 cliente
 switchport mode access
 switchport access vlan 10
interface FastEthernet0/4
 switchport mode access
 switchport access vlan 20
interface FastEthernet0/5
 switchport mode access
 switchport access vlan 20
interface FastEthernet0/10
 switchport mode access
 switchport access vlan 99
interface GigabitEthernet0/1
 description Troncal a R1
 switchport trunk native vlan 99
 switchport trunk allowed vlan ${f20()==='trunk_no20'?'10,99':'10,20,99'}
 switchport mode trunk
 mls qos trust dscp
!
interface Vlan99
 ip address 192.168.99.2 255.255.255.0
ip default-gateway 192.168.99.1
end
`}
function sMls(i){const tr=/0\/1$/.test(i)&&!/0\/1[0-9]/.test(i)||/^g/.test(i);return`${i}
QoS is ${cfg.mls?'enabled':'disabled'} globally
trust state: ${cfg.mls?(tr?'trust dscp':'not trusted'):'(mls qos desactivado: el DSCP pasa sin cambios)'}
trust mode: ${tr?'trust dscp':'not trusted'}
COS override: dis
default COS: 0
${cfg.mls&&!tr?'DSCP de entrada re-marcado a 0 (CS0)\n':''}`}
function sInt(i){const w=win(5),map={'fa0/1':['FastEthernet0/1','srvb',P.srv,'100Mb/s'],'fa0/2':['FastEthernet0/2','fa2',P.fa2,'100Mb/s'],'gi0/1':['GigabitEthernet0/1','up',P.up,'1000Mb/s']};
  const k=i.replace('fastethernet','fa').replace('gigabitethernet','gi');const m=map[k];if(!m)return'% Interfaz no simulada. Use fa0/1, fa0/2 o gi0/1\n';
  const r=w?w.port(m[1]):0;const down=k==='fa0/2'&&f20()==='client_vlan';
  return`${m[0]} is up, line protocol is up (connected)
  Full-duplex, ${m[3]}, media type is 10/100/1000BaseTX
  5 second ${k==='fa0/1'?'input':'output'} rate ${kbps(r)} bits/sec, ${w?Math.round(r/9000):0} packets/sec
     ${m[2].txP} packets ${k==='fa0/1'?'input':'output'}, ${m[2].txB} bytes
     0 output errors, 0 collisions, 0 interface resets${down?'\n  (puerto en VLAN 10: el router nunca le entrega tráfico de la VLAN 20)':''}
`}
function ipcfg(){const me=dev==='PC-Cliente'?['192.168.20.10','192.168.20.1']:['192.168.10.11','192.168.10.1'];
  return dev==='PC-Cliente'?`Adaptador de Ethernet Ethernet:
   Dirección IPv4. . . . . . . . . . : ${me[0]}
   Máscara de subred . . . . . . . . : 255.255.255.0
   Puerta de enlace predeterminada . : ${me[1]}
`:`2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet ${me[0]}/24 brd 192.168.10.255 scope global eth0
default via ${me[1]} dev eth0
`}
function arpA(){const ok=!['client_vlan','trunk_no20','sub20_down'].includes(f20());return`Interfaz: 192.168.20.10 --- 0x4
  Dirección de Internet     Dirección física      Tipo
${ok?'  192.168.20.1          00-d0-ba-11-00-01     dinámico\n':'  (sin entrada para 192.168.20.1: la solicitud ARP no obtiene respuesta)\n'}  192.168.20.11         00-50-56-a1-20-11     dinámico
`}
function trace(ip){const q=qms(),gwOk=!['client_vlan','trunk_no20','sub20_down'].includes(f20()),r=v=>Math.max(1,Math.round(v+Math.random()*2));
  if(dev==='PC-Cliente'){if(!gwOk)return`Traza a ${ip}\n  1  *  *  *  Tiempo de espera agotado.\n  2  *  *  *  Tiempo de espera agotado.\n`;
    return`Traza a ${ip} sobre un máximo de 30 saltos:\n  1   ${r(q)} ms   ${r(q)} ms   ${r(q)} ms  192.168.20.1\n  2   ${r(q+.5)} ms   ${r(q+.5)} ms   ${r(q+.5)} ms  ${ip}\nTraza completa. (la respuesta vuelve por la cola de G0/0.20)\n`}
  return`traceroute to ${ip}\n 1  192.168.10.1  0.6 ms  0.5 ms  0.5 ms\n 2  ${ip}  ${nf(1+(ip.startsWith('192.168.20')?q:0),1)} ms\n`}

/* ping real: los paquetes ICMP que van hacia VLAN 20 pasan por la cola real de G0/0.20 */
let pingNat=false;
function pingPlan(ip){const f=f20(),gw=!['client_vlan','trunk_no20','sub20_down'].includes(f),v20=ip.startsWith('192.168.20.'),pub=!ip.startsWith('192.168.');
  if(dev==='PC-Cliente'){if(ip==='192.168.20.10')return{ok:1,f1:.05,f2:0,cross:0,ttl:128};
    if(v20&&ip!=='192.168.20.1')return f==='client_vlan'?{unreach:1}:{ok:1,f1:.3,f2:0,cross:0,ttl:128};
    if(!gw)return{unreach:1};if(pub){pingNat=true;return{ok:1,f1:22,f2:.1,cross:1,ttl:115,port:P.fa2}}
    if(['192.168.20.1','192.168.10.1','192.168.99.1'].includes(ip))return{ok:1,f1:.15,f2:.1,cross:1,ttl:255,port:P.fa2};
    if(['192.168.10.10','192.168.10.11','192.168.99.2'].includes(ip))return{ok:1,f1:.45,f2:.1,cross:1,ttl:63,port:P.fa2};return{timeout:1}}
  if(dev==='R1'){if(v20){if(f!=='none'&&f!=='acl_block'||!['192.168.20.10','192.168.20.11','192.168.20.12'].includes(ip))return{timeout:1};return{ok:1,f1:0,f2:.15,cross:1,ttl:128,port:ip==='192.168.20.10'?P.fa2:P.fa4}}
    if(pub)return{ok:1,f1:20,f2:0,cross:0,ttl:116};return['192.168.10.10','192.168.10.11','192.168.99.2','192.168.99.10'].includes(ip)?{ok:1,f1:.4,f2:0,cross:0,ttl:64}:{timeout:1}}
  if(dev==='SW1'||dev==='PC-iperf'){if(v20){if(['trunk_no20','sub20_down'].includes(f)||(f==='client_vlan'&&ip==='192.168.20.10'))return{timeout:1};
      if(!['192.168.20.1','192.168.20.10','192.168.20.11','192.168.20.12'].includes(ip))return{timeout:1};return ip==='192.168.20.1'?{ok:1,f1:.3,f2:0,cross:0,ttl:255}:{ok:1,f1:.4,f2:.15,cross:1,ttl:127,port:ip==='192.168.20.10'?P.fa2:P.fa4}}
    if(pub)return dev==='SW1'?{timeout:1}:{ok:1,f1:21,f2:0,cross:0,ttl:116};return{ok:1,f1:.5,f2:0,cross:0,ttl:dev==='SW1'?255:63}}
  return{timeout:1}}
function ping(ip){const d0=dev,o=t=>out(t,d0);if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip))return o('Dirección no válida\n');const d=dev,win=d==='PC-Cliente',N=win?4:5,sz=win?32:100,plan=pingPlan(ip),res=[];
  if(win)o(`\nHaciendo ping a ${ip} con ${sz} bytes de datos:\n`);else if(d==='PC-iperf')o(`PING ${ip} (${ip}) 56(84) bytes of data.\n`);else o(`Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${ip}, timeout is 2 seconds:\n`);
  let i=0;const step=()=>{if(i>=N)return done();const k=++i,t0=now;let fin=false;
    const ok=()=>{if(fin)return;fin=true;const rtt=(now-t0)*1000+Math.random()*.3;res.push(rtt);
      if(win)o(`Respuesta desde ${ip}: bytes=${sz} tiempo${rtt<1?'<1m':'='+Math.round(rtt)+'m'}s TTL=${plan.ttl}\n`);else if(d==='PC-iperf')o(`64 bytes from ${ip}: icmp_seq=${k} ttl=${plan.ttl} time=${nf(rtt,2).replace(',','.')} ms\n`);else o('!');
      at(now+(win||d==='PC-iperf'?1:.01),step)};
    const fail=()=>{if(fin)return;fin=true;res.push(null);if(win)o(plan.unreach?`Respuesta desde 192.168.20.10: Host de destino inaccesible.\n`:'Tiempo de espera agotado para esta solicitud.\n');else if(d==='PC-iperf')o('');else o('.');at(now+(win?.01:.01),step)};
    if(plan.unreach){at(now+(win?3:2),fail);return}if(plan.timeout){at(now+(win?4:2),fail);return}
    if(!plan.cross){at(now+plan.f1/1000*(1+Math.random()*.2),ok);return}
    at(now+plan.f1/1000,()=>{const p=pk({flow:'icmp',size:sz+46,dscp:0,src:d==='PC-Cliente'?ip:d==='R1'?'192.168.20.1':d==='SW1'?'192.168.99.2':'192.168.10.11',dst:d==='PC-Cliente'?'192.168.20.10':ip,proto:'ICMP',icmpSeq:k,ttl:plan.ttl,vlan:20,
      path:[P.r20,swTr,plan.port,()=>at(now+plan.f2/1000,ok)],onDrop:()=>at(now+(win?4:2),fail)});next(p)});
    at(now+(win?4:2),fail)};
  const done=()=>{const okN=res.filter(v=>v!==null),mn=Math.min(...okN),mx=Math.max(...okN),av=okN.reduce((a,b)=>a+b,0)/(okN.length||1);
    if(win)o(`\nEstadísticas de ping para ${ip}:\n    Paquetes: enviados = ${N}, recibidos = ${okN.length}, perdidos = ${N-okN.length}\n    (${Math.round((N-okN.length)/N*100)}% perdidos),\n${okN.length?`Tiempos aproximados de ida y vuelta en milisegundos:\n    Mínimo = ${Math.round(mn)}ms, Máximo = ${Math.round(mx)}ms, Media = ${Math.round(av)}ms\n`:''}`);
    else if(d==='PC-iperf')o(`--- ${ip} ping statistics ---\n${N} packets transmitted, ${okN.length} received, ${Math.round((N-okN.length)/N*100)}% packet loss\n${okN.length?`rtt min/avg/max = ${nf(mn,2)}/${nf(av,2)}/${nf(mx,2)} ms\n`:''}`);
    else o(`\nSuccess rate is ${Math.round(okN.length/N*100)} percent (${okN.length}/${N})${okN.length?`, round-trip min/avg/max = ${Math.max(1,Math.round(mn))}/${Math.max(1,Math.round(av))}/${Math.max(1,Math.round(mx))} ms`:''}\n`)};
  step()}
let iperfJob=null;
function iperfCmd(c){const d0=dev,o=t=>out(t,d0);if(iperfJob)return o('iperf3: ya hay una prueba en curso\n');const m=c.match(/-b\s*([\d.]+)\s*([kmg]?)/),t=+(c.match(/-t\s*(\d+)/)||[0,10])[1],tos=/--tos\s*(136|0x88)/.test(c);
  if(!/-c\s*192\.168\.20\.11/.test(c))return o('iperf3: error - no se puede conectar al servidor: use -c 192.168.20.11 (iperf3 -s corre en 192.168.20.11)\n');
  const mult={k:1e-3,m:1,g:1e3,'':1e-6}[m?m[2]:'m'];const rate=m?Math.min(90,+m[1]*mult):1;
  if(!/-u/.test(c))o('(Este simulador modela iperf3 en modo UDP; se usa -u)\n');
  const prev=cfg.iperf;cfg.tosOverride=tos;setForm({iperf:Math.round(rate)});readCfg();cfg.iperf=rate;
  o(`Connecting to host 192.168.20.11, port 5201\n[  5] local 192.168.10.11 port 43512 connected to 192.168.20.11 port 5201\n[ ID] Interval           Transfer     Bitrate         Jitter    Lost/Total Datagrams\n`);
  let s=0,b={rx:IPS.rx,rxB:IPS.rxB,lost:IPS.lost};const st0={...b};
  const tick=()=>{s++;const r=IPS.rx-b.rx,l=IPS.lost-b.lost,by=IPS.rxB-b.rxB;b={rx:IPS.rx,rxB:IPS.rxB,lost:IPS.lost};
    o(`[  5] ${lpad(nf(s-1,2).replace(',','.'),6)}-${pad(nf(s,2).replace(',','.')+' sec',10)} ${lpad(nf(by/1048576,2).replace(',','.'),5)} MBytes ${lpad(nf(by*8/1e6,1).replace(',','.'),5)} Mbits/sec  ${nf(IPS.J*1000,3).replace(',','.')} ms  ${l}/${r+l} (${nf((r+l)?l/(r+l)*100:0,1).replace(',','.')}%)\n`);
    if(s<t)at(now+1,tick);else{const R=IPS.rx-st0.rx,L=IPS.lost-st0.lost;o(`- - - - - - - - - - - - - - - - - - - - - - - - -\n[  5]   0.00-${t}.00  sec  receiver  ${L}/${R+L} (${nf((R+L)?L/(R+L)*100:0,2).replace(',','.')}%) perdidos\n\niperf Done.\n`);
      cfg.tosOverride=false;setForm({iperf:prev});readCfg();iperfJob=null}};
  iperfJob=1;at(now+1,tick)}

/* ---------- experimentos ---------- */
const BASE={res:'1280x720',fps:30,codec:'h264',tr:'udp',hw:'cpu',link:20,qos:'fifo',vpct:40,qlim:64,iperf:0,tcpn:0,ipaf:false,mls:true,cache:300,fault:'none'};
const EXP={A:{runs:[{res:'854x480'},{res:'1280x720'},{res:'1920x1080'}]},B:{runs:[{fps:15},{fps:30}]},C:{base:{qos:'fifo'},runs:[{iperf:0},{iperf:10},{iperf:17},{iperf:22}]},
  D:{base:{iperf:22,tcpn:2},runs:[{qos:'fifo'},{qos:'cbwfq'},{qos:'llq'}]}};
const ROWS=[];let exBusy=false;
const desc=()=>`${cfg.res.replace('x','×')} ${cfg.fps} FPS ${CODN[cfg.codec]} ${cfg.tr.toUpperCase()} · enlace ${cfg.link} Mbps · QoS ${cfg.qos==='fifo'?'no':cfg.qos.toUpperCase()} · iperf3 ${cfg.iperf} Mbps · TCP ${cfg.tcpn}${cfg.fault!=='none'?' · falla '+cfg.fault:''}`;
function measure(tag,cb){const s0=snap(),t0=now;$('#exstat').textContent=`${tag}: midiendo 8 s…`;
  at(now+8,()=>{const r=diff(s0,snap());const sj=SAMP.filter(x=>x.t>t0);if(sj.length)r.jit=sj.reduce((a,x)=>a+x.J,0)/sj.length*1000;
    ROWS.push({tag,d:desc(),...r});renderRows();cb&&cb()})}
function runExp(k){if(exBusy)return;exBusy=true;btns(true);const E=EXP[k];let i=0;
  const go=()=>{if(i>=E.runs.length){exBusy=false;btns(false);$('#exstat').textContent=`Experimento ${k} terminado.`;return}
    setForm({...BASE,...(E.base||{}),...E.runs[i]});apply(true);const tag=`${k}${i+1}`;i++;$('#exstat').textContent=`${tag}: estabilizando 3 s…`;at(now+3,()=>measure(tag,go))};go()}
function btns(d){document.querySelectorAll('[data-exp],#exnow').forEach(b=>b.disabled=d)}
function renderRows(){if(!ROWS.length){$('#exres').innerHTML='<tr><td colspan="10" class="hint">Sin mediciones todavía.</td></tr>';return}
  $('#exres').innerHTML=ROWS.map(r=>`<tr><td>${r.tag}</td><td>${r.d}</td><td class="n">${nf(r.vbr,2)} Mbps</td><td class="n">${Math.round(r.util*100)} %</td><td class="n">${nf(r.loss*100,2)} %</td><td class="n">${isNaN(r.lat)?'—':Math.round(r.lat)+' ms'}</td><td class="n">${isNaN(r.p95)?'—':Math.round(r.p95)+' ms'}</td><td class="n">${nf(r.jit,2)} ms</td><td class="n">${nf(r.fps,1)}</td><td class="n">${nf(r.q,1)} ms</td></tr>`).join('')}
function csv(){return['Exp;Configuración;Bitrate video (Mbps);Uso enlace (%);Pérdida video (%);Latencia media (ms);Latencia p95 (ms);Jitter (ms);FPS cliente;Cola router (ms)',
  ...ROWS.map(r=>[r.tag,r.d,nf(r.vbr,2),Math.round(r.util*100),nf(r.loss*100,2),Math.round(r.lat)||'',Math.round(r.p95)||'',nf(r.jit,2),nf(r.fps,1),nf(r.q,1)].join(';'))].join('\n')}

/* ---------- aplicar cambios ---------- */
let prevKey='';
function apply(force){readCfg();const key=[cfg.res,cfg.fps,cfg.codec,cfg.tr,cfg.cache,cfg.fault].join('|');setTransport();setTcpFlows(cfg.tcpn);
  if(force||key!==prevKey){resetPlayer();prevKey=key}if(force){zero();SAMP.push(snap())}}
document.querySelectorAll('.ctl-grid select,.ctl-grid input').forEach(el=>el.addEventListener(el.type==='range'?'input':'change',()=>apply(false)));
let paused=false;$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'Continuar':'Pausar'};
$('#reset').onclick=()=>{zero();SAMP.push(snap());CAP.rows=[]};
$('#replay').onclick=()=>resetPlayer();
$('#tap').onchange=e=>{CAP.tap=e.target.value;CAP.rows=[]};
$('#capbtn').onclick=()=>{CAP.on=!CAP.on;$('#capbtn').textContent=CAP.on?'Detener captura':'Reanudar captura'};
$('#captbl').onclick=e=>{const tr=e.target.closest('tr');if(!tr)return;const r=CAP.rows.find(x=>x.no===+tr.dataset.no);if(r){CAP.sel=r.no;inspect(r);document.querySelectorAll('#captbl tr').forEach(t=>t.classList.toggle('sel',t===tr))}};
$('#devtabs').onclick=e=>{const b=e.target.closest('button');if(b){dev=b.dataset.dev;tabs();$('#tin').focus()}};
const HIST=[];let hi=0;
$('#tform').onsubmit=e=>{e.preventDefault();const v=$('#tin').value;if(v.trim()){HIST.push(v);hi=HIST.length}runCmd(v);$('#tin').value=''};
$('#tin').onkeydown=e=>{if(e.key==='ArrowUp'&&hi>0){hi--;$('#tin').value=HIST[hi];e.preventDefault()}else if(e.key==='ArrowDown'){hi=Math.min(HIST.length,hi+1);$('#tin').value=HIST[hi]||'';e.preventDefault()}};
$('#ctopo').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;for(const k in TL.N||{}){const n=TL.N[k];if(Math.abs(mx-n.X)<TL.bw/2&&Math.abs(my-n.Y)<TL.bh/2){dev=n.dev;tabs();$('#tin').focus({preventScroll:true});return}}};
document.querySelectorAll('[data-exp]').forEach(b=>b.onclick=()=>runExp(b.dataset.exp));
$('#exnow').onclick=()=>{if(exBusy)return;exBusy=true;btns(true);measure('Manual',()=>{exBusy=false;btns(false);$('#exstat').textContent='Medición guardada.'})};
$('#exclear').onclick=()=>{ROWS.length=0;renderRows();$('#csvbox').style.display='none'};
$('#excopy').onclick=async()=>{const t=csv();try{await navigator.clipboard.writeText(t);$('#exstat').textContent='CSV copiado (separador ;).'}catch(e){const b=$('#csvbox');b.style.display='block';b.value=t;b.select();$('#exstat').textContent='Copie el CSV del cuadro de texto.'}};
new MutationObserver(colors).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',colors);

/* ---------- arranque ---------- */
colors();readCfg();apply(true);tabs();
for(const d in DEV)out('Consola simulada de '+d+'. Escriba ? para ver los comandos.\n',d);
at(0,capTick);at(0,iperfTick);at(.25,sample);
let last=performance.now(),acc=0;
function loop(ts){const dt=Math.min(.05,(ts-last)/1000);last=ts;
  const vis=$('#ctopo').offsetParent!==null;
  if(vis){if(!paused)runTo(now+dt*cfg.speed);topo(paused?0:dt);drawVideos();acc+=dt;if(acc>.25){acc=0;panels();charts()}}
  requestAnimationFrame(loop)}
requestAnimationFrame(loop);
window.__red={get now(){return now},cfg,C,win,RS,DR};
}
