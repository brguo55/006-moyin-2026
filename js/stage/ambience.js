"use strict";
/* ============================================================
   ambience.js：留声机放的环境声 —— 雨声、风声、自然声（溪水 + 白天鸟叫、夜里虫鸣）、炉火、火车
   全部用程序现做（噪声 + 滤波 + 振荡器），不用音频文件，离线也能用
   每种单独开关、单独音量；经过一个压限器接到 master（静音键一起关）；浏览器要先点一下 / 按一下键才让出声
   一直响的底子（雨、溪水、炉火、火车）是预先算好、头尾接得上的一段立体声，循环放；
   风是实时的（滤波器的频率、音量慢慢起伏）；一下一下的（鸟叫、虫鸣）提前 2 秒排好，窗口切到后台也不断
   ============================================================ */

const SOUNDS = [
  { id: 'rain', name: '雨声', note: '屋檐下的雨' },
  { id: 'wind', name: '风声', note: '一阵一阵的风' },
  { id: 'nature', name: '自然声', note: '溪水和鸟叫，夜里是虫鸣' },
  { id: 'fire', name: '炉火', note: '噼啪作响的火炉' },
  { id: 'train', name: '火车', note: '咔哒咔哒，一节一节过去' },
];

/* ---------- 做声音用的小工具 ---------- */
const white = () => Math.random() * 2 - 1;
const onePole = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);   // 一阶低通的系数
function pinkGen(){   // 粉红噪声（Paul Kellet 的滤波）：比白噪声柔和
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = white();
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return p * 0.11;
  };
}
function brownGen(){ let last = 0; return () => (last = (last + 0.02 * white()) / 1.02) * 3.5; }   // 棕噪声：低沉
/* 把一段声音调到差不多的响度：rms 按平均响度，peak 按最响的那一下（零星的噼啪声用这个）；最后软削一下顶 */
function ambLevel(arrs, { rms, peak }){
  let sum = 0, n = 0, max = 0;
  for (const a of arrs) for (let i = 0; i < a.length; i++){ sum += a[i] * a[i]; n++; max = Math.max(max, Math.abs(a[i])); }
  const k = rms ? rms / (Math.sqrt(sum / n) || 1) : peak / (max || 1);
  for (const a of arrs) for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * k);
}
/* 预先算好的一段立体声：多算 0.25 秒，用来和开头交叉淡化 → 循环时听不出接缝 */
function ambLoop(sec, fill){
  const sr = AC.sampleRate, n = Math.floor(sec * sr), x = Math.floor(0.25 * sr);
  const L = new Float32Array(n + x), R = new Float32Array(n + x);
  fill(L, R, n + x, sr);
  const buf = AC.createBuffer(2, n, sr);
  [L, R].forEach((src, c) => {
    const out = buf.getChannelData(c);
    for (let i = 0; i < n; i++){
      if (i >= x){ out[i] = src[i]; continue; }
      const a = i / x;
      out[i] = src[i] * Math.sqrt(a) + src[n + i] * Math.sqrt(1 - a);
    }
  });
  return buf;
}

/* ---------- 一直响的底子（第一次打开时算一次，留着） ---------- */
const AMB_FILL = {
  /* 雨：粉红噪声去掉低频（沙沙），音量很慢地起伏；上面是密密的雨滴（偶尔一滴大的，落在近处） */
  rain: [10, (L, R, n, sr) => {
    for (const out of [L, R]){
      const pink = pinkGen(), aL = onePole(5000, sr), aH = onePole(300, sr), ph = Math.random() * TAU;
      let lp = 0, low = 0;
      for (let i = 0; i < n; i++){
        lp += aL * (pink() - lp); low += aH * (lp - low);
        out[i] = (lp - low) * (0.8 + 0.2 * Math.sin(i / sr * TAU * 0.05 + ph));
      }
      for (let t = 0; t < n; t += Math.floor(sr * (0.004 + Math.random() * 0.03))){
        const big = Math.random() < 0.04, len = Math.floor(sr * (big ? 0.03 : 0.008 + Math.random() * 0.012));
        const amp = (big ? 0.5 : 0.08 + Math.random() * 0.25) * (0.4 + Math.random() * 0.6);
        const w = TAU * (big ? 900 + Math.random() * 700 : 2500 + Math.random() * 3500) / sr, ad = onePole(big ? 3000 : 7000, sr);
        let lpd = 0;
        for (let k = 0; k < len && t + k < n; k++){
          const env = Math.exp(-k / (len * 0.22)) * Math.min(1, k / (sr * 0.0006));
          lpd += ad * (white() - lpd);
          out[t + k] += (lpd * 0.7 + Math.sin(k * w) * 0.3) * amp * env;
        }
      }
    }
    ambLevel([L, R], { rms: 0.09 });
  }],
  /* 溪水：低一点的粉红噪声 + 一串串往上滑的小水泡（咕嘟） */
  stream: [12, (L, R, n, sr) => {
    for (const out of [L, R]){
      const pink = pinkGen(), a = onePole(1200, sr), ah = onePole(250, sr);
      let lp = 0, low = 0;
      for (let i = 0; i < n; i++){ lp += a * (pink() - lp); low += ah * (lp - low); out[i] = (lp - low) * 0.5; }
      for (let t = 0; t < n; t += Math.floor(sr * (0.01 + Math.random() * 0.06))){
        const len = Math.floor(sr * (0.015 + Math.random() * 0.04)), f0 = 300 + Math.random() * 700, rise = 1.4 + Math.random() * 1.2, amp = 0.05 + Math.random() * 0.12;
        let ph = 0;
        for (let k = 0; k < len && t + k < n; k++){
          const p = k / len;
          ph += TAU * f0 * (1 + (rise - 1) * p) / sr;
          out[t + k] += Math.sin(ph) * amp * Math.sin(Math.PI * p) ** 2;
        }
      }
    }
    ambLevel([L, R], { rms: 0.05 });
  }],
  /* 炉火的底子：很低的轰轰声，忽强忽弱；隔几秒「嘶——」一下（木头里的水汽） */
  fire: [13, (L, R, n, sr) => {
    for (const out of [L, R]){
      const brown = brownGen(), a = onePole(380, sr), ph = Math.random() * TAU;
      let lp = 0;
      for (let i = 0; i < n; i++){
        lp += a * (brown() - lp);
        out[i] = lp * (0.75 + 0.25 * Math.sin(i / sr * TAU * 0.3 + ph) * Math.sin(i / sr * TAU * 0.17));
      }
      for (let t = Math.floor(sr * Math.random() * 3); t < n; t += Math.floor(sr * (3 + Math.random() * 5))){
        const len = Math.floor(sr * (0.4 + Math.random() * 0.9)), af = onePole(4500, sr), ah = onePole(2500, sr);
        let lp1 = 0, lo = 0;
        for (let k = 0; k < len && t + k < n; k++){ lp1 += af * (white() - lp1); lo += ah * (lp1 - lo); out[t + k] += (lp1 - lo) * 0.25 * Math.sin(Math.PI * k / len); }
      }
    }
    ambLevel([L, R], { rms: 0.07 });
  }],
  /* 噼啪：零零星星的脆响，有时候一串（和底子长度不一样，叠起来很久才重复一次） */
  crackle: [9.4, (L, R, n, sr) => {
    for (const out of [L, R]){
      for (let t = Math.floor(sr * Math.random() * 0.3); t < n; t += Math.floor(sr * (0.05 + Math.random() * 0.35))){
        const burst = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 5) : 1;
        for (let b = 0; b < burst; b++){
          const at = t + Math.floor(sr * Math.random() * 0.06), len = Math.floor(sr * (0.0015 + Math.random() * 0.005)), amp = Math.pow(Math.random(), 1.5);
          let prev = 0;
          for (let k = 0; k < len && at + k < n; k++){ const w = white(); out[at + k] += (w - prev) * amp * Math.exp(-k / (len * 0.3)); prev = w; }
        }
      }
    }
    ambLevel([L, R], { peak: 0.55 });
  }],
  /* 火车：低低的轰隆、铁轨的沙沙，车轮压过接缝「咚咚」—— 一节车厢：咔哒咔哒 …… 咔哒咔哒，循环正好五节 */
  train: [8.5, (L, R, n, sr) => {
    for (const out of [L, R]){
      const brown = brownGen(), pink = pinkGen(), a = onePole(140, sr), ah = onePole(2500, sr), al = onePole(900, sr);
      let lp = 0, h1 = 0, h2 = 0;
      for (let i = 0; i < n; i++){
        lp += a * (brown() - lp);
        const p = pink(); h1 += ah * (p - h1); h2 += al * (h1 - h2);
        out[i] = lp * 1.4 * (0.85 + 0.15 * Math.sin(i / sr * TAU * 0.6)) + (h1 - h2) * 0.12;
      }
    }
    const cycle = 1.7;
    for (let c = 0; c * cycle * sr < n; c++){
      for (const [off, loud] of [[0, 1], [0.13, 0.85], [0.42, 0.9], [0.55, 0.8]]){
        const at = Math.floor((c * cycle + off + (Math.random() - 0.5) * 0.006) * sr), len = Math.floor(sr * 0.12);
        for (const [out, side] of [[L, 1], [R, 0.92]]){
          let ph = 0;
          for (let k = 0; k < len && at + k < n; k++){
            const tt = k / sr;
            ph += TAU * (70 + 50 * Math.exp(-tt * 30)) / sr;
            const click = k < sr * 0.006 ? white() * Math.exp(-k / (sr * 0.0015)) : 0;
            out[at + k] += (Math.sin(ph) * Math.exp(-tt * 28) * 0.9 + click * 0.35) * loud * side;
          }
        }
      }
    }
    ambLevel([L, R], { rms: 0.1 });
  }],
};

const Ambience = {
  ch: {},            // 正在响的：id → { out, on, vol, stop(), tick?(until) }
  bus: null, timer: 0, bufs: {},

  _ready(){
    if (!AC || !master) return false;
    if (!this.bus){
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
      this.bus = AC.createGain();
      this.bus.connect(comp); comp.connect(master);
    }
    return true;
  },
  _buf(name){ return this.bufs[name] || (this.bufs[name] = ambLoop(AMB_FILL[name][0], AMB_FILL[name][1])); },
  _loop(name, dest, gain = 1){
    const s = AC.createBufferSource(), g = AC.createGain();
    s.buffer = this._buf(name); s.loop = true; g.gain.value = gain;
    s.connect(g); g.connect(dest); s.start(AC.currentTime, Math.random() * s.buffer.duration);
    return [s, g];
  },
  /* 打开 / 关上 / 调音量（慢慢变过去）；vol 0–1，按平方算（滑块中间那段更好调） */
  set(id, on, vol){
    if (!this._ready()) return;
    let c = this.ch[id];
    if (on && !c){
      c = this.ch[id] = this._make(id);
      c.out.gain.value = 0;
      c.out.connect(this.bus);
      if (c.tick) c.tick(AC.currentTime + 2);
    }
    if (!c) return;
    c.on = on; c.vol = vol;
    const now = AC.currentTime;
    c.out.gain.cancelScheduledValues(now);
    c.out.gain.setTargetAtTime(on ? vol * vol : 0, now, on ? 0.6 : 0.35);
    clearTimeout(c.stopT);
    if (!on) c.stopT = setTimeout(() => {   // 淡出以后真的停掉，省电
      if (c.on) return;
      for (const nd of c.nodes){ try { if (nd.stop) nd.stop(); } catch (e){} nd.disconnect(); }
      c.out.disconnect();
      delete this.ch[id];
      this._timer();
    }, 3000);
    this._timer();
  },
  playing(){ return !muted && Object.values(this.ch).some(c => c.on); },
  playingNames(){ return SOUNDS.filter(s => this.ch[s.id] && this.ch[s.id].on).map(s => s.name); },
  /* 有一下一下排着放的声音时，每 0.25 秒往后排 2 秒 */
  _timer(){
    const need = Object.values(this.ch).some(c => c.tick);
    if (need && !this.timer) this.timer = setInterval(() => { const until = AC.currentTime + 2; for (const c of Object.values(this.ch)) if (c.tick) c.tick(until); }, 250);
    else if (!need && this.timer){ clearInterval(this.timer); this.timer = 0; }
  },

  /* ---------- 五种声音 ---------- */
  _make(id){
    const out = AC.createGain(), nodes = [];
    if (id === 'rain') nodes.push(...this._loop('rain', out));
    if (id === 'fire') nodes.push(...this._loop('fire', out, 1.3), ...this._loop('crackle', out, 1.05));
    if (id === 'train') nodes.push(...this._loop('train', out, 0.75));
    if (id === 'wind') nodes.push(...this._wind(out));
    if (id === 'nature'){
      nodes.push(...this._loop('stream', out, 1.75));
      return { out, nodes, tick: this._critters(out, nodes) };
    }
    return { out, nodes };
  },
  /* 风：粉红噪声过一个带通，中心频率和音量慢慢起伏、左右飘；上面再叠一条窄一点的「呼——」 */
  _wind(out){
    const nodes = [];
    const lfo = (f, depth, param) => { const o = AC.createOscillator(), d = AC.createGain(); o.frequency.value = f; d.gain.value = depth; o.connect(d); d.connect(param); o.start(); nodes.push(o, d); };
    const src = AC.createBufferSource();
    src.buffer = this._windNoise(); src.loop = true;
    const bp = AC.createBiquadFilter(), g = AC.createGain(), pan = AC.createStereoPanner();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.8; g.gain.value = 0.26;
    src.connect(bp); bp.connect(g); g.connect(pan); pan.connect(out);
    lfo(0.047, 260, bp.frequency); lfo(0.11, 110, bp.frequency); lfo(0.073, 0.16, g.gain); lfo(0.031, 0.5, pan.pan);
    const src2 = AC.createBufferSource(), bp2 = AC.createBiquadFilter(), g2 = AC.createGain();
    src2.buffer = src.buffer; src2.loop = true;
    bp2.type = 'bandpass'; bp2.frequency.value = 820; bp2.Q.value = 9; g2.gain.value = 0.1;
    src2.connect(bp2); bp2.connect(g2); g2.connect(out);
    lfo(0.05, 300, bp2.frequency); lfo(0.083, 0.087, g2.gain);
    src.start(0, Math.random() * 3); src2.start(0, Math.random() * 3);
    nodes.push(src, src2, bp, bp2, g, g2, pan);
    return nodes;
  },
  /* 风用的噪声：4 秒粉红噪声（单声道，循环） */
  _windNoise(){
    if (this.bufs.windNoise) return this.bufs.windNoise;
    const sr = AC.sampleRate, n = sr * 4, x = Math.floor(sr * 0.25), pink = pinkGen(), raw = new Float32Array(n + x);
    for (let i = 0; i < n + x; i++) raw[i] = pink() * 3;
    const buf = AC.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = i < x ? raw[i] * Math.sqrt(i / x) + raw[n + i] * Math.sqrt(1 - i / x) : raw[i];
    return (this.bufs.windNoise = buf);
  },
  /* 鸟和虫：白天隔几秒一声鸟叫（三种叫法，左右随机），夜里换成三只蟋蟀，各唧各的 → 返回往后排声音的 tick(until)
     一直开着的话一小时要叫上万声：蟋蟀各用一个固定的左右声道（放在 nodes 里，关掉时一起断开），
     每声鸟叫用完自己的那个声道就断开，不会越积越多 */
  _critters(out, nodes){
    const now = AC.currentTime;
    const panAt = p => { const n = AC.createStereoPanner(); n.pan.value = p; n.connect(out); return n; };
    const crickets = [4300, 4650, 4050].map((f, i) => ({ f, dest: panAt([-0.6, 0.5, 0.05][i]), next: now + Math.random() }));
    nodes.push(...crickets.map(c => c.dest));
    let nextBird = now + 0.8;
    const note = (at, f0, f1, dur, vol, dest) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(dest); o.start(at); o.stop(at + dur + 0.02);
      return o;
    };
    const bird = at => {
      const dest = panAt(rnd(-0.8, 0.8)), kind = Math.floor(Math.random() * 3);
      let last;   // 排在最后的那个音最后结束：它停了，这声鸟叫的声道就断开
      if (kind === 0){ const f = rnd(2600, 3600), k = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < k; i++) last = note(at + i * 0.13, f, f * 1.35, 0.08, 0.12, dest); }
      else if (kind === 1){ const f = rnd(3800, 4600); for (let i = 0; i < 8; i++) last = note(at + i * 0.045, f, f * 0.94, 0.03, 0.09, dest); }
      else { const f = rnd(1800, 2400); note(at, f * 1.25, f, 0.22, 0.12, dest); last = note(at + 0.3, f * 1.1, f * 0.85, 0.14, 0.1, dest); }
      last.onended = () => dest.disconnect();
    };
    const cricket = (at, c) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.frequency.value = c.f;
      g.gain.setValueAtTime(0, at);
      for (let k = 0; k < 4; k++){ const t0 = at + k * 0.028; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.004); g.gain.linearRampToValueAtTime(0, t0 + 0.018); }
      o.connect(g); g.connect(c.dest); o.start(at); o.stop(at + 0.14);
    };
    return until => {
      const night = skyMix().night > 0.5;
      for (; nextBird < until; nextBird += rnd(2.5, 7)) if (!night) bird(nextBird);
      for (const c of crickets) for (; c.next < until; c.next += rnd(0.55, 1.1)) if (night) cricket(c.next, c);
    };
  },
};
