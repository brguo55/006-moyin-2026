"use strict";
/* ============================================================
   pixel.js：像素画的小工具
   整个场景先画在一张「低分辨率」画布上（1 个像素 = 2 个世界单位），
   再按整数倍、不平滑地放大到屏幕上 → 每个像素都是清清楚楚的小方块
   ------------------------------------------------------------
   字符画精灵：每个字符是一个像素，'.' 是透明；颜色查调色板（{ 字符: '#rrggbb' }）
   ============================================================ */

const PX = 2;                       // 1 个像素 = 2 个世界单位
function pxCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').imageSmoothingEnabled = false;
  return c;
}

/* ---------- 往 PG（当前像素画布）上画：坐标都是整数像素 ---------- */
let PG = null;
const OUTL = '#3d2c2a';             // 家具的勾边色（比角色的黑线柔和一点 → 人物更跳出来）
function rect(x, y, w, h, c){ PG.fillStyle = c; PG.fillRect(x, y, w, h); }
function dot(x, y, c){ PG.fillStyle = c; PG.fillRect(x, y, 1, 1); }
/* 勾边方块 */
function boxO(x, y, w, h, fill, ol = OUTL){
  rect(x, y, w, h, ol);
  if (fill && w > 2 && h > 2) rect(x + 1, y + 1, w - 2, h - 2, fill);
}
/* 勾边 + 上亮下暗（木板、家具面板） */
function bevel(x, y, w, h, fill, lt, dk, ol = OUTL){
  boxO(x, y, w, h, fill, ol);
  if (w > 3 && h > 3){ rect(x + 1, y + 1, w - 2, 1, lt); if (h > 4) rect(x + 1, y + h - 2, w - 2, 1, dk); }
}
/* 棋盘格抖动（像素画里的「半透明 / 渐变」） */
function dither(x, y, w, h, c, ph = 0){
  PG.fillStyle = c;
  for (let j = 0; j < h; j++) for (let i = (j + ph) & 1; i < w; i += 2) PG.fillRect(x + i, y + j, 1, 1);
}
function disc(cx, cy, r, c){
  for (let dy = -r; dy <= r; dy++){ const dx = Math.round(Math.sqrt(r * r - dy * dy)); rect(cx - dx, cy + dy, dx * 2 + 1, 1, c); }
}
function ring(cx, cy, r, c){
  for (let dy = -r; dy <= r; dy++){
    const dx = Math.round(Math.sqrt(r * r - dy * dy)), dIn = dy * dy < (r - 1) * (r - 1) ? Math.round(Math.sqrt((r - 1) * (r - 1) - dy * dy)) : -1;
    if (dIn < 0) rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
    else { rect(cx - dx, cy + dy, dx - dIn, 1, c); rect(cx + dIn + 1, cy + dy, dx - dIn, 1, c); }
  }
}
/* 字符画直接画到 PG 上 */
function art(rows, pal, x, y){
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++){ const ch = row[i]; if (ch !== '.') dot(x + i, y + j, pal[ch]); } });
}

/* ---------- 字符画 → 小画布（精灵）；flip = 左右镜像 ---------- */
const rgbCache = {};
function hexRgb(s){
  if (rgbCache[s]) return rgbCache[s];
  return (rgbCache[s] = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
}
const rgbHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function makeSprite(rows, pal, flip){
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = pxCanvas(w, h), g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++){
    const ch = rows[j][i];
    if (ch === '.') continue;
    const [r, gg, b] = hexRgb(pal[ch]), o = (j * w + (flip ? w - 1 - i : i)) * 4;
    d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return c;
}

/* ---------- 抖动溶解（换主题时新旧两张图一格一格地替换）---------- */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayerMasks = [];               // 17 档：第 n 档有 n/16 的格子是不透明的
for (let n = 0; n <= 16; n++){
  const c = pxCanvas(4, 4), g = c.getContext('2d');
  g.fillStyle = '#000';
  for (let i = 0; i < 16; i++) if (BAYER4[i] < n) g.fillRect(i % 4, i >> 2, 1, 1);
  bayerMasks.push(c);
}
/* 同样 17 档，做成能平铺的花样：第一次用时做好，之后每帧直接拿（不用每帧都 createPattern） */
let bayerPats = null;
function bayerPat(n){
  if (!bayerPats) bayerPats = bayerMasks.map(c => c.getContext('2d').createPattern(c, 'repeat'));
  return bayerPats[n];
}
