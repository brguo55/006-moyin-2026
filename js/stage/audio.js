"use strict";
/* ============================================================
   audio.js：声音 —— 碰杯的「叮」、番茄钟铃声；全部经过一个总开关（静音）
   首次点击 / 按键后才开声（浏览器自动播放策略）
   ============================================================ */

let AC = null;
let master = null;    // 总输出：静音按钮关的是它
let muted = false;

function initAudio(){
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(AC.destination);
  } catch(err){ /* 音频不可用则静默 */ return; }
  if (typeof onAudioReady === 'function') onAudioReady();   // 能出声了：把上次开着的环境声接着放（sounddesk.js）
}

/* 静音：所有声音一起淡出 / 淡入 */
function setMuted(m){
  muted = m;
  if (!master) return;
  const now = AC.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.setTargetAtTime(m ? 0 : 1, now, 0.12);
}
/* 画布上的静音按钮 / 按 M：切换并通知应用层记下来 */
function toggleMute(){
  initAudio();
  setMuted(!muted);
  sceneChanged();
}

/* 一个带两三个泛音、指数衰减的小铃音 */
function tone(f, at, vol, partials){
  const t0 = AC.currentTime + at;
  for (const [m, a, d] of partials){
    const o = AC.createOscillator(), g = AC.createGain();
    o.frequency.value = f*m;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol*a, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + d + 0.05);
  }
}

/* 碰杯：两只瓷杯「叮」的一声（两下，略错开、略不同音高） */
function clink(){
  if (!AC || AC.state !== 'running') return;
  const base = rnd(2300, 2600);
  const cup = [[1, 1, 0.5], [1.48, 0.45, 0.32], [2.71, 0.2, 0.18]];
  tone(base, 0, 0.05, cup);
  tone(base * 1.06, 0.035, 0.035, cup);
}

/* 门口的控制面板：像空调遥控器那样「滴」一声 */
function beep(){
  if (!AC || AC.state !== 'running') return;
  const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime;
  o.frequency.value = 1760;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.005);
  g.gain.setValueAtTime(0.035, t0 + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.12);
}

/* 点到小鸟：一声短短的「啾」 */
function chirp(){
  if (!AC || AC.state !== 'running') return;
  const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime;
  o.frequency.setValueAtTime(1800, t0);
  o.frequency.exponentialRampToValueAtTime(3200, t0 + 0.08);
  o.frequency.exponentialRampToValueAtTime(2200, t0 + 0.14);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.04, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.2);
}

/* 二段跳：两下很轻的「扑」（下滑的三角波），像拍了一下翅膀 */
function flap(){
  if (!AC || AC.state !== 'running') return;
  for (const at of [0, 0.07]){
    const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + at;
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, t0);
    o.frequency.exponentialRampToValueAtTime(240, t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.14);
  }
}

/* 番茄钟铃声：三声由低到高的风铃 */
function bell(){
  if (!AC) return;
  if (AC.state === 'suspended') AC.resume();
  [880, 1046.5, 1318.51].forEach((f, i) => tone(f, 0.05 + i*0.32, 0.12, [[1, 1, 2.4], [2.76, 0.3, 1.1], [5.4, 0.1, 0.5]]));
}
