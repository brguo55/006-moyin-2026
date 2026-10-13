"use strict";
/* ============================================================
   听雨 · 舞台 —— 像素风的 2D 小房子
   engine.js：小工具 / 画布 / 面板让位
   纯 Canvas 2D，零依赖
   ============================================================ */

/* ---------- 小工具 ---------- */
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function hash(n){ const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }

/* ---------- 画布 ---------- */
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;

/* 舞台可用区域：右侧被面板占去 insetR 像素时，房间放在剩下区域的中间。
   CX 每帧缓动到 cxTo（main.js），面板开合时平滑挪位。 */
let insetR = 0, CX = 0, cxTo = 0;
function sceneLayout(){ cxTo = Math.max(240, W - insetR) / 2; }
function setSceneInset(px){ insetR = px; sceneLayout(); }
/* 场景现在怎么显示（app.js 设）：
   'split' 面板开着，场景最大 1 倍；'big' 面板收起来了，场景放大铺满窗口；
   'hidden' 面板铺满了窗口，场景被挡住（不画、也不听按键）；'immersive' 番茄钟沉浸，场景照常、不显示放大按钮 */
let sceneMode = 'split';
function setSceneMode(m){ sceneMode = m; }
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;   // 放大像素图时不要糊
  sceneLayout();
  if (!CX) CX = cxTo;   // 首次直接到位
}
