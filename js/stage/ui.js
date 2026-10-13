"use strict";
/* ============================================================
   ui.js：画在画布上的像素控件 —— 背景、镜头外框、底部主题色板、左上角静音和放大场景
   界面上的一个「像素」= 2 个 CSS 像素（对齐到屏幕像素，放大后也是方方正正的）
   ============================================================ */

const uiPx = () => Math.max(1, Math.round(2 * DPR)) / DPR;
const snapS = v => Math.round(v * DPR) / DPR;
function fillR(x, y, w, h, col){ ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

/* ---------- 背景：带一点主题色的纸 + 淡淡的点阵（像方格本） ---------- */
let bgPat = null, bgPatDpr = 0;
function drawBackground(){
  fillR(0, 0, W, H, rgbHex(lerpC(PAPER, curWash(), 0.22)));
  if (!bgPat || bgPatDpr !== DPR){
    const u = Math.max(1, Math.round(2 * DPR)), c = pxCanvas(u * 8, u * 8), g = c.getContext('2d');
    g.fillStyle = 'rgba(62,48,38,0.10)'; g.fillRect(0, 0, u, u);
    bgPat = ctx.createPattern(c, 'repeat'); bgPatDpr = DPR;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgPat; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.restore();
}

/* ---------- 镜头外框：像素木框（缺角）+ 硬阴影；u = 场景里一个像素的宽 ---------- */
function drawViewFrame(x, y, w, h, u){
  const o = 5 * u;
  fillR(x - o + 3 * u, y - o + 3 * u, w + 2 * o, h + 2 * o, 'rgba(40,28,24,0.18)');
  fillR(x - o + u, y - o, w + 2 * o - 2 * u, h + 2 * o, OUTL);
  fillR(x - o, y - o + u, w + 2 * o, h + 2 * o - 2 * u, OUTL);
  fillR(x - 4 * u, y - 4 * u, w + 8 * u, h + 8 * u, HC.wm);
  fillR(x - 4 * u, y - 4 * u, w + 8 * u, u, HC.wl); fillR(x - 4 * u, y - 4 * u, u, h + 8 * u, HC.wl);
  fillR(x - 4 * u, y + h + 3 * u, w + 8 * u, u, HC.wd); fillR(x + w + 3 * u, y - 4 * u, u, h + 8 * u, HC.wd);
  for (const [a, b] of [[x - 3 * u, y - 3 * u], [x + w + u, y - 3 * u], [x - 3 * u, y + h + u], [x + w + u, y + h + u]]){
    fillR(a, b, 2 * u, 2 * u, HC.wdk); fillR(a, b, u, u, HC.gold);
  }
  fillR(x - u, y - u, w + 2 * u, h + 2 * u, OUTL);
}

/* ---------- 主题色板（画面底部一行像素小方块；选中的抬高一点，下面有个小箭头） ---------- */
const NSWATCH = 7;
let hoverIdx = -1;
function swatchPos(i){
  const u = uiPx(), act = i === themeIdx, hov = i === hoverIdx, s = 14 * u;
  return {
    x: snapS(CX + (i - (NSWATCH - 1) / 2) * 24 * u - s / 2),
    y: snapS(H - 66 - (act ? 3 : (hov ? 1 : 0)) * u),
    s, u,
  };
}
function hitSwatch(px, py){
  for (let i = 0; i < NSWATCH; i++){
    const { x, y, s, u } = swatchPos(i);
    if (px > x - 3 * u && px < x + s + 3 * u && py > y - 3 * u && py < y + s + 4 * u) return i;
  }
  return -1;
}
function drawSwatches(){
  for (let i = 0; i < NSWATCH; i++){
    const { x, y, s, u } = swatchPos(i), P = THEMES[i], act = i === themeIdx;
    fillR(x + u, y + s, s - u, (act ? 3 : 1) * u, 'rgba(40,28,24,0.18)');
    fillR(x + u, y, s - 2 * u, s, OUTL); fillR(x, y + u, s, s - 2 * u, OUTL);
    fillR(x + u, y + u, s - 2 * u, s - 2 * u, rgbHex(P.W));
    fillR(x + u, y + u, s - 2 * u, u, rgbHex(P.LT)); fillR(x + u, y + u, u, s - 2 * u, rgbHex(P.LT));
    fillR(x + u, y + s - 2 * u, s - 2 * u, u, rgbHex(P.DK)); fillR(x + s - 2 * u, y + u, u, s - 2 * u, rgbHex(P.DK));
    if (act){   // 小箭头 ▲
      const cx = x + s / 2 - u / 2;
      fillR(cx, y + s + 5 * u, u, u, OUTL); fillR(cx - u, y + s + 6 * u, 3 * u, u, OUTL);
    }
  }
}

/* ---------- 静音（画面左上角 · 像素小喇叭：有声时两道声波，静音时一个叉） ---------- */
const SPK_PAL = { k: '#3e3026', w: '#d4e0e8' };
const SPK_ON = makeSprite([
  '.....k.......',
  '....kk....k..',
  '.kkkwk.k...k.',
  '.kwwwk..k..k.',
  '.kwwwk..k..k.',
  '.kkkwk.k...k.',
  '....kk....k..',
  '.....k.......',
], SPK_PAL);
const SPK_OFF = makeSprite([
  '.....k.......',
  '....kk.......',
  '.kkkwk.k...k.',
  '.kwwwk..k.k..',
  '.kwwwk...k...',
  '.kkkwk..k.k..',
  '....kk.k...k.',
  '.....k.......',
], SPK_PAL);
let muteHover = false;
function muteBtnPos(){ const u = uiPx(); return { x: snapS(30), y: snapS(46 - (muteHover ? u : 0)), u }; }
function hitMuteBtn(px, py){
  const { x, y, u } = muteBtnPos();
  return px > x - 3 * u && px < x + 16 * u && py > y - 3 * u && py < y + 11 * u;
}
function drawMuteBtn(){
  const { x, y, u } = muteBtnPos();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = muteHover ? 1 : 0.8;
  ctx.drawImage(muted ? SPK_OFF : SPK_ON, x, y, 13 * u, 8 * u);
  ctx.globalAlpha = 1;
}

/* ---------- 放大场景（小喇叭右边 · 四个角朝外 = 放大，收起面板、场景铺满窗口；朝里 = 恢复） ---------- */
const BIG_ON = makeSprite([
  'kkk..kkk',
  'k......k',
  'k......k',
  '........',
  '........',
  'k......k',
  'k......k',
  'kkk..kkk',
], SPK_PAL);
const BIG_OFF = makeSprite([
  '..k..k..',
  '..k..k..',
  'kkk..kkk',
  '........',
  '........',
  'kkk..kkk',
  '..k..k..',
  '..k..k..',
], SPK_PAL);
let bigHover = false;
const sceneBtnShown = () => sceneMode === 'split' || sceneMode === 'big';
function sceneBtnPos(){ const u = uiPx(); return { x: snapS(30 + 20 * u), y: snapS(46 - (bigHover ? u : 0)), u }; }
function hitSceneBtn(px, py){
  if (!sceneBtnShown()) return false;
  const { x, y, u } = sceneBtnPos();
  return px > x - 3 * u && px < x + 11 * u && py > y - 3 * u && py < y + 11 * u;
}
function drawSceneBtn(){
  if (!sceneBtnShown()) return;
  const { x, y, u } = sceneBtnPos();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = bigHover ? 1 : 0.8;
  ctx.drawImage(sceneMode === 'big' ? BIG_OFF : BIG_ON, x, y, 8 * u, 8 * u);
  ctx.globalAlpha = 1;
}
