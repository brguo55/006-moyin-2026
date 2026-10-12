"use strict";
/* ============================================================
   house.js：国风 + 星海的像素小屋（整张地图 1800 × 500 像素，1 像素 = 2 世界单位）
   ------------------------------------------------------------
   rabbit 住在一颗人造小行星上：屋子是温暖的中式木构（红漆柱、回纹、灯笼、博古架、挂轴），
   窗外是穹顶里的庭院（白墙黛瓦、竹子，下着人工雨），再往外是星海（行星、漂浮小岛上的楼阁、镖船）
   分层（从远到近）：
     窗外远景（星海 + 庭院，跟着镜头只移动一半）+ 雨丝
     房子（静态：墙、地板、家具 —— 预先画好一整张；窗户是透明的，透出后面的远景）
     会动的小东西（挂轴上的番茄钟、屏幕里的雨、挂钟、灯笼的光、茶的热气）
     人物（room.js 画）
     前景（红漆柱、垂下来的藤、大瓷瓶：比中景移动得快 → 景深）
   坐标：这里全部是「像素」坐标；平台的 y（世界单位）÷ 2 就是那块板子的顶面那一行
   ============================================================ */

const AW = MAP_W / PX, AH = MAP_H / PX;                       // 1800 × 500
const A_FL = FLOOR_Y / PX, A_MZ = MEZZ_Y / PX, A_MX = MEZZ_X0 / PX;
const A_WL = WALL_L / PX, A_WR = WALL_R / PX, A_CE = CEIL_Y / PX;

/* ---------- 调色板：暖木、朱漆、金、青花、玉 ---------- */
const HC = {
  out: '#24161a',
  beam: '#4a2a1e', beamLt: '#6a3c28', beamDk: '#331c14',
  wdk: '#5a3324', wd: '#7c4630', wm: '#a85f3a', wl: '#d08a52', wh: '#e9b07a',
  lac: '#a8322d', lacL: '#cf4f3c', lacD: '#7a2420',
  fl: '#8a5638', flLt: '#b07048', flDk: '#6a4029', flSeam: '#4e2e1e',
  brick: '#4b4757', brickLt: '#5d586b', brickDk: '#383442',
  paper: '#f6e3c0', paperDk: '#e2c89a', ink: '#2a1a14',
  gold: '#e8b04f', goldLt: '#ffd98a', goldDk: '#b07a30',
  jade: '#5fb59a', jadeLt: '#a6e3c8', jadeDk: '#24584a',
  porc: '#f2f2ec', blue: '#3d5c9e', blueLt: '#9fb8e8',
  leaf: '#6f9a5a', leafLt: '#9cc47e', leafDk: '#476c3c',
  pink: '#f2a2a9', pinkLt: '#f9cdcf', pinkDk: '#d98591',
  red: '#c0392b', redLt: '#e06a4f',
  lantern: '#ff7a45', lanternLt: '#ffb070', lanternDk: '#c8452f',
  clay: '#a85a3a', clayLt: '#c97a52', straw: '#d9b36a', strawDk: '#a8833f',
  white: '#fbf6ea', celadon: '#a9cdb8',
};
const BOOKC = [['#3d5c9e', '#2c4475'], ['#a8322d', '#7a2420'], ['#d9b36a', '#a8833f'], ['#476c3c', '#33502c'], ['#e2c89a', '#c4a874'], ['#5a3a6e', '#422a52']];

/* 跟着主题变的颜色：灰泥墙、地毯 */
function themeCols(){
  const T = THEMES[themeIdx], wall = lerpC([238, 222, 196], T.W, 0.22);
  return {
    wall: rgbHex(wall), wallLt: rgbHex(lerpC(wall, [255, 250, 240], 0.35)), wallDk: rgbHex(lerpC(wall, [90, 60, 45], 0.12)),
    rug: rgbHex(lerpC(T.W, [168, 50, 45], 0.45)), rugLt: rgbHex(T.LT), rugDk: rgbHex(lerpC(T.DK, [90, 30, 30], 0.4)),
  };
}

/* ============================================================
   静态部分：整张地图画一次（换主题时重画）
   ============================================================ */
let houseCv = null, houseOld = null, houseTheme = -1;
function buildHouse(){
  if (houseCv && houseTheme !== themeIdx){ houseOld = houseCv; houseCv = null; }
  houseCv = houseCv || pxCanvas(AW, AH);
  paintHouse(houseCv.getContext('2d'));
  houseTheme = themeIdx;
}
function paintHouse(g){
  PG = g;
  g.clearRect(0, 0, AW, AH);
  const tc = themeCols();
  rect(0, 0, AW, AH, HC.out);
  // 灰泥墙（一点点斑驳）
  rect(A_WL, A_CE, A_WR - A_WL, A_FL - A_CE, tc.wall);
  for (let i = 0; i < 2600; i++){
    const x = A_WL + Math.floor(hash(i * 1.7) * (A_WR - A_WL)), y = A_CE + Math.floor(hash(i * 3.3) * (A_FL - A_CE));
    dot(x, y, i % 3 ? tc.wallDk : tc.wallLt);
  }
  // 屋顶大梁 + 梁下一圈回纹木饰带
  rect(0, 0, AW, A_CE, HC.beam); rect(0, 0, AW, 2, HC.beamDk);
  for (let x = 24; x < AW; x += 48) rect(x, 3, 1, A_CE - 6, HC.beamDk);
  rect(0, A_CE - 2, AW, 1, HC.beamLt); rect(0, A_CE - 1, AW, 1, OUTL);
  fretBand(A_WL, A_CE, A_WR - A_WL, HC.wd, HC.wl);
  fretBand(A_MX, A_MZ + 8, A_WR - A_MX, HC.wd, HC.wl);
  // 护墙板（回纹）：一楼、阁楼
  wainscot(A_WL, A_FL - 30, A_WR - A_WL, 30);
  wainscot(A_MX, A_MZ - 25, A_WR - A_MX, 25);
  // 窗：月洞窗、格子窗、阁楼的小圆窗（玻璃留透明）
  moonGate(810, 366, 48);
  latticeWindow(...WINDOWS[1]);
  roundWindow(1350, 190, 26);
  // 红漆柱（阁楼那边只到阁楼地板）
  for (const x of [280, 700, 1050, 1450]) pillar(x - 4, A_CE + 6, (x >= A_MX ? A_MZ : A_FL) - A_CE - 6, x < A_MX);
  // 木地板
  rect(0, A_FL, AW, AH - A_FL, HC.fl);
  rect(0, A_FL, AW, 1, HC.flLt);
  rect(0, A_FL + 10, AW, 1, HC.flSeam); rect(0, A_FL + 20, AW, 1, HC.flSeam);
  for (let x = 6; x < AW; x += 37){ rect(x, A_FL + 1, 1, 9, HC.flSeam); rect(x + 18, A_FL + 11, 1, 9, HC.flSeam); rect(x + 9, A_FL + 21, 1, 9, HC.flSeam); }
  rect(0, A_FL + 21, AW, AH - A_FL - 21, HC.flDk); for (let x = 15; x < AW; x += 37) rect(x, A_FL + 21, 1, 9, HC.flSeam);
  // 两头：青砖墙
  bricks(0, A_CE, A_WL, A_FL - A_CE); bricks(A_WR, A_CE, AW - A_WR, A_FL - A_CE);
  rect(A_WL - 1, A_CE, 1, A_FL - A_CE, OUTL); rect(A_WR, A_CE, 1, A_FL - A_CE, OUTL);

  drawEntrance();
  drawLibrary();
  drawTeaCorner(tc);
  drawStudy();
  drawRightEnd();
  drawMezzanine(tc);
}

/* 回纹：一个 8 像素的「卍字回纹」单元，横着排 */
const FRET = ['########', '#......#', '#.####.#', '#.#..#.#', '#.#.##.#', '#.#....#', '#.######'];
function fretBand(x, y, w, base, line){
  rect(x, y, w, 9, base); rect(x, y + 8, w, 1, OUTL);
  for (let px = x + 2; px + 8 <= x + w; px += 10) FRET.forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === '#') dot(px + i, y + 1 + j, line); });
}
function wainscot(x, y, w, h){
  rect(x, y, w, h, HC.wd);
  rect(x, y, w, 1, OUTL); rect(x, y + 1, w, 1, HC.wl);
  for (let px = x + 4; px + 8 <= x + w; px += 12) FRET.forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === '#') dot(px + i, y + 5 + j, HC.wm); });
  rect(x, y + h - 4, w, 4, HC.wdk); rect(x, y + h - 4, w, 1, OUTL);
}
function pillar(x, y, h, base){
  rect(x, y, 9, h, HC.lac); rect(x, y, 1, h, OUTL); rect(x + 8, y, 1, h, OUTL);
  rect(x + 2, y, 2, h, HC.lacL); rect(x + 6, y, 1, h, HC.lacD);
  rect(x - 2, y, 13, 4, HC.gold); rect(x - 2, y + 3, 13, 1, OUTL); rect(x - 2, y, 13, 1, HC.goldLt);
  if (base){ const by = y + h - 5; rect(x - 2, by, 13, 5, '#8c8698'); rect(x - 2, by, 13, 1, '#b3aec0'); rect(x - 2, by + 4, 13, 1, OUTL); }
}
function bricks(x, y, w, h){
  rect(x, y, w, h, HC.brick);
  for (let j = 0, r = 0; j < h; j += 6, r++){
    rect(x, y + j, w, 1, HC.brickDk); rect(x, y + j + 1, w, 1, HC.brickLt);
    for (let i = (r % 2) * 5 + 2; i < w; i += 10) rect(x + i, y + j + 1, 1, 5, HC.brickDk);
  }
}
/* 窗户透明区域的外接框（x, y, 宽, 高）：镜头里一个都没有时就不画远景 */
const WINDOWS = [[762, 318, 97, 97], [1525, 340, 100, 90], [1324, 164, 53, 53]];
function clearDisc(cx, cy, r){
  for (let dy = -r; dy <= r; dy++){ const dx = Math.round(Math.sqrt(r * r - dy * dy)); PG.clearRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function glints(x, y, n){
  PG.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < n; i++) PG.fillRect(x + i, y - i, 1, 1);
}
/* 月洞窗：圆的木框 + 一圈金线；下面一块雕花窗台（能站：顶面 420） */
function moonGate(cx, cy, r){
  disc(cx, cy, r + 7, OUTL); disc(cx, cy, r + 6, HC.wm);
  for (let a = 3.4; a < 5.0; a += 0.04) dot(cx + Math.round(Math.cos(a) * (r + 4)), cy + Math.round(Math.sin(a) * (r + 4)), HC.wl);
  disc(cx, cy, r + 2, HC.gold); disc(cx, cy, r + 1, OUTL);
  clearDisc(cx, cy, r);
  glints(cx - 30, cy - 4, 18); glints(cx - 24, cy, 8);
  bevel(754, 420, 112, 5, HC.wl, HC.wh, HC.wd);
  for (const bx of [760, 852]) art(['kmmmk', 'kmmk.', 'kmk..', 'kk...'].map(s => bx > 800 ? [...s].reverse().join('') : s), PW, bx, 425);
  rect(770, 425, 80, 2, OUTL); rect(771, 425, 78, 1, HC.wd);
}
/* 格子窗：朱漆框，玻璃四周一圈回纹格子，中间留空看外面；窗台顶面 = y + h */
function latticeWindow(x, y, w, h){
  bevel(x - 6, y - 6, w + 12, h + 12, HC.lac, HC.lacL, HC.lacD);
  rect(x - 1, y - 1, w + 2, h + 2, OUTL);
  PG.clearRect(x, y, w, h);
  const lw = 7;
  for (const [lx, ly, ww, hh] of [[x, y, w, lw], [x, y + h - lw, w, lw], [x, y, lw, h], [x + w - lw, y, lw, h]]){
    for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++){
      const gx = (lx + i - x) % 7, gy = (ly + j - y) % 7;
      if (gx === 0 || gy === 0 || (gx === 3 && gy > 1 && gy < 6) || (gy === 3 && gx > 1 && gx < 6)) dot(lx + i, ly + j, HC.wd);
    }
  }
  rect(x + lw, y + lw, w - lw * 2, 1, OUTL); rect(x + lw, y + h - lw - 1, w - lw * 2, 1, OUTL);
  rect(x + lw, y + lw, 1, h - lw * 2, OUTL); rect(x + w - lw - 1, y + lw, 1, h - lw * 2, OUTL);
  glints(x + 14, y + 30, 14); glints(x + 20, y + 32, 6);
  bevel(x - 6, y + h, w + 12, 5, HC.wl, HC.wh, HC.wd);
  rect(x - 3, y + h + 5, w + 6, 2, OUTL); rect(x - 2, y + h + 5, w + 4, 1, HC.wd);
}
function roundWindow(cx, cy, r){
  disc(cx, cy, r + 5, OUTL); disc(cx, cy, r + 4, HC.wm);
  for (let a = 3.5; a < 4.9; a += 0.05) dot(cx + Math.round(Math.cos(a) * (r + 3)), cy + Math.round(Math.sin(a) * (r + 3)), HC.wl);
  disc(cx, cy, r + 1, HC.gold); disc(cx, cy, r, OUTL);
  clearDisc(cx, cy, r - 1);
  glints(cx - 16, cy - 6, 9);
}

/* ---------- 小物件（字符画） ---------- */
const PW = { k: OUTL, d: HC.wd, m: HC.wm, l: HC.wl, D: HC.wdk };
const BRACKET = ['kmmmk', 'kmmk.', 'kmk..', 'kk...'];
const BONSAI = [
  '..kkkk...',
  '.kgggLk..',
  'kgggLLgk.',
  '.kggggk..',
  '...kdk...',
  '..kdk....',
  '.kkkkkkk.',
  '.kbwbwbk.',
  '..kkkkk..',
];
const BONSAI_PAL = { k: OUTL, g: HC.leaf, L: HC.leafLt, d: HC.wdk, b: HC.blue, w: HC.porc };
const BELL = [
  '....k....',
  '...kyk...',
  '..kyyyk..',
  '..kyYyk..',
  '.kyyYyyk.',
  '.kyyyyyk.',
  'kyyyyyyyk',
  'kkkkkkkkk',
  '...kyk...',
  '....k....',
];
const BELL_PAL = { k: OUTL, y: HC.gold, Y: HC.goldLt };
const TEAPOT = [
  '....kkk.....',
  '...kcCck....',
  '.kkkkkkkk...',
  'kccccccccK.k',
  'kcCccccccKkk',
  'kcccccccck..',
  'kccccccccK..',
  '.kccccccK...',
  '..kkkkkk....',
];
const TEAPOT_PAL = { k: OUTL, c: HC.clay, C: HC.clayLt, K: '#7a3a24' };
const VASE = ['..kkk..', '..kwk..', '.kwwwk.', 'kwwbwwk', 'kwbbbwk', 'kwwbwwk', '.kwwwk.', '..kkk..'];
const VASE_PAL = { k: OUTL, w: HC.porc, b: HC.blue };
const CAPE = [
  '...kkk....',
  '..kpppk...',
  '..kppppk..',
  '.kppppPk..',
  '.kpppPppk.',
  '.kpppPppk.',
  'kppppPpppk',
  'kpppPppppk',
  'kpppPppppk',
  'kppPpppppk',
  'kppPppppPk',
  'kppPppppPk',
  'kpPpppppPk',
  'kpPpppppPk',
  '.kkkkkkkk.',
];
const CAPE_PAL = { k: OUTL, p: HC.pinkLt, P: HC.pink };
const HAT = ['....kk....', '...kssk...', '..kssssk..', '.kssSsssk.', 'kkkkkkkkkk'];   // 斗笠
const HAT_PAL = { k: OUTL, s: HC.straw, S: HC.strawDk };
const BOOT = ['kkkk...', 'k12k...', 'k122kk.', 'k11111k', 'kkkkkkk'];
const BOOT_PAL = { k: '#2a2a2a', '1': '#595b5b', '2': '#787a79' };
const LEAF = ['..kk.', '.kgLk', 'kggLk', 'kgLk.', 'kLk..', 'kk...'];
const LEAF_PAL = { k: OUTL, g: HC.leaf, L: HC.leafLt };

/* 线装书：一摞平放的 */
function bookStack(x, y, n, seed){
  for (let i = 0; i < n; i++){
    const [c, cd] = BOOKC[(i + seed) % BOOKC.length], w = 12 + ((i * 5 + seed) % 5), bx = x + ((i * 3 + seed) % 3);
    boxO(bx, y - (i + 1) * 3, w, 3, c); dot(bx + 2, y - (i + 1) * 3 + 1, HC.paper); dot(bx + 3, y - (i + 1) * 3 + 1, cd);
  }
}
/* 一排立着的书 */
function books(x, y, w, h, seed){
  let cx = x + 1;
  for (let i = 0; ; i++){
    if ((i + seed) % 7 === 4) cx += 3;
    const bw = 3 + ((i * 7 + seed * 3) % 3), bh = h - 6 + ((i * 5 + seed * 2) % 6);
    if (cx + bw + 1 > x + w) break;
    const [c, cd] = BOOKC[(i + seed * 2) % BOOKC.length];
    rect(cx, y + h - bh, bw + 2, bh, OUTL);
    rect(cx + 1, y + h - bh + 1, bw, bh - 1, c);
    rect(cx + 1, y + h - bh + 3, bw, 1, cd); rect(cx + 1, y + h - 4, bw, 1, HC.paper);
    cx += bw + 1;
  }
}
/* 挂轴：上下两根木轴、中间是纸 */
function scroll(x, y, w, h){
  rect(x - 3, y - 3, w + 6, 3, HC.wdk); dot(x - 4, y - 2, HC.gold); dot(x + w + 3, y - 2, HC.gold);
  rect(x + (w >> 1), y - 7, 1, 4, OUTL);
  rect(x, y, w, h, OUTL); rect(x + 1, y, w - 2, h - 1, HC.paper); rect(x + 1, y, w - 2, 1, HC.paperDk);
  rect(x - 3, y + h, w + 6, 3, HC.wdk); dot(x - 4, y + h + 1, HC.gold); dot(x + w + 3, y + h + 1, HC.gold);
}

/* 门口墙上的控制面板（像空调遥控器）：点它、或者飘到旁边按 E → 打开设置 */
const CTRL = [150, 408, 15, 20];   // x, y, 宽, 高（像素）
/* ---------- 门厅：格扇门、对联、油纸伞、衣帽架（斗笠 + 粉斗篷）、鞋凳、控制面板 ---------- */
function drawEntrance(){
  bevel(46, 391, 53, 79, HC.lac, HC.lacL, HC.lacD);
  for (const lx of [51, 73]){
    boxO(lx, 396, 21, 74, HC.lac);
    rect(lx + 2, 399, 17, 30, HC.wdk);                                      // 上半：格子
    for (let gy = 401; gy < 428; gy += 5) rect(lx + 2, gy, 17, 1, HC.wl);
    for (let gx = lx + 4; gx < lx + 19; gx += 5) rect(gx, 399, 1, 30, HC.wl);
    rect(lx + 3, 434, 15, 30, HC.lacD); rect(lx + 4, 435, 13, 28, HC.lac);   // 下半：裙板
  }
  for (const kx of [69, 77]){ ring(kx, 433, 2, HC.gold); }                  // 铜门环
  boxO(44, 380, 57, 9, HC.wdk); for (let x = 52; x < 94; x += 9) rect(x, 383, 4, 3, HC.gold);   // 横批
  for (const cx of [37, 104]){ rect(cx, 394, 6, 52, OUTL); rect(cx + 1, 395, 4, 50, HC.red); for (let y = 398; y < 442; y += 8) rect(cx + 2, y, 2, 3, HC.gold); }
  rect(40, 467, 66, 3, OUTL); rect(41, 468, 64, 2, HC.red); for (let x = 43; x < 104; x += 4) dot(x, 468, HC.redLt);
  // 青花瓷缸 + 收起来的油纸伞
  rect(114, 428, 1, 26, HC.wdk); dot(113, 427, HC.wdk); dot(112, 427, HC.wdk); dot(111, 428, HC.wdk); dot(111, 429, HC.wdk);
  for (let y = 434; y < 454; y++){ const w = y < 438 ? 1 : (y < 448 ? 2 : 1); rect(114 - w - 1, y, w * 2 + 3, 1, OUTL); rect(114 - w, y, w * 2 + 1, 1, y % 5 ? HC.pink : HC.pinkDk); }
  for (let j = 0; j < 18; j++){ const w = 6 - Math.abs(8 - j) / 3 | 0; rect(114 - w - 1, 452 + j, w * 2 + 3, 1, OUTL); rect(114 - w, 452 + j, w * 2 + 1, 1, j % 6 === 3 ? HC.blue : HC.porc); }
  // 衣帽架：粉斗篷、斗笠
  rect(134, 400, 4, 68, OUTL); rect(135, 401, 2, 66, HC.wd); rect(135, 401, 1, 66, HC.wm);
  rect(126, 466, 20, 4, OUTL); rect(127, 467, 18, 2, HC.wd);
  rect(133, 397, 6, 4, OUTL); rect(134, 398, 4, 2, HC.gold);
  rect(128, 405, 7, 1, OUTL); rect(137, 405, 7, 1, OUTL);
  art(CAPE, CAPE_PAL, 122, 405);
  art(HAT, HAT_PAL, 137, 401);
  // 鞋凳（能站）+ 两只靴子
  bevel(165, 456, 51, 4, HC.wl, HC.wh, HC.wd);
  for (const x of [168, 209]) boxO(x, 460, 4, 10, HC.wd);
  art(BOOT, BOOT_PAL, 176, 465); art(BOOT, BOOT_PAL, 188, 465);
  // 控制面板：铜框、玉色小屏幕（内容每帧画）、两个小按钮
  const [cx, cy, cw, ch] = CTRL;
  rect(cx + 1, cy + ch, cw, 1, 'rgba(60,40,30,0.25)');                     // 一点点投影
  bevel(cx, cy, cw, ch, HC.goldDk, HC.gold, '#7a5222');
  rect(cx + 2, cy + 2, cw - 4, 9, OUTL); rect(cx + 3, cy + 3, cw - 6, 7, HC.jadeDk);
  for (const bx of [cx + 3, cx + 8]) { rect(bx, cy + 13, 4, 3, OUTL); rect(bx + 1, cy + 14, 2, 1, HC.wl); }
}

/* ---------- 书房：两个高高的博古架、绣墩、一路往上的置物板、星图手卷 ---------- */
function curioShelf(x0, x1, top, seed){
  const bx = x0 + 2, bw = x1 - x0 - 4, by = top + 4, bh = A_FL - by;
  boxO(bx, by, bw, bh, HC.wdk);
  rect(bx + 1, by, 1, bh - 1, HC.wm);
  // 不规则的格子：每层的隔板位置错开
  let y = by + 3, row = 0;
  while (y + 26 <= A_FL - 3){
    const cut = bx + 10 + ((row * 17 + seed) % (bw - 24));
    rect(bx + 3, y, bw - 6, 22, '#3e2219');
    rect(cut, y, 3, 22, HC.wm); rect(cut + 3, y, 1, 22, OUTL);
    const L = [bx + 3, cut - bx - 3], R = [cut + 4, bx + bw - 3 - cut - 4];
    const kind = (row + seed) % 4;
    // 左格、右格各放一样东西
    if (kind === 0){ books(L[0], y, L[1], 22, row + seed); art(VASE, VASE_PAL, R[0] + (R[1] >> 1) - 3, y + 14); }
    else if (kind === 1){ bookStack(L[0] + 2, y + 22, 4, row); books(R[0], y, R[1], 22, row + 3); }
    else if (kind === 2){ art(BONSAI, BONSAI_PAL, L[0] + (L[1] >> 1) - 4, y + 13); bookStack(R[0] + 1, y + 22, 3, row + 2); }
    else { books(L[0], y, L[1], 22, row + 5); for (let k = 0; k < 3; k++){ rect(R[0] + 2 + k * 5, y + 13, 4, 9, OUTL); rect(R[0] + 3 + k * 5, y + 14, 2, 7, HC.paper); dot(R[0] + 3 + k * 5, y + 14, HC.red); } }
    bevel(bx + 3, y + 22, bw - 6, 4, HC.wm, HC.wl, HC.wd);
    y += 26; row++;
  }
  bevel(x0, top, x1 - x0, 4, HC.wl, HC.wh, HC.wd);
  rect(x0 + 2, top + 4, x1 - x0 - 4, 1, HC.gold);
}
function wallShelf(x0, x1, y, item){
  bevel(x0, y, x1 - x0, 4, HC.wl, HC.wh, HC.wd);
  art(BRACKET, PW, x0 + 3, y + 4); art(BRACKET.map(r => [...r].reverse().join('')), PW, x1 - 8, y + 4);
  if (item === 'books'){
    bookStack(x1 - 18, y, 3, Math.floor(x0 / 7));
    rect(x0 + 5, y - 5, 5, 5, OUTL); rect(x0 + 6, y - 4, 3, 3, HC.celadon);     // 青瓷小杯
  } else if (item === 'bonsai') art(BONSAI, BONSAI_PAL, x1 - 13, y - 9);
  else if (item === 'bell') art(BELL, BELL_PAL, x1 - 16, y - 10);
}
function drawLibrary(){
  curioShelf(318, 382, 350, 1);
  curioShelf(488, 552, 325, 4);
  // 绣墩（能站：顶面 450）
  rect(431, 450, 24, 20, OUTL); rect(432, 451, 22, 18, HC.lac); rect(432, 451, 22, 2, HC.gold); rect(432, 467, 22, 2, HC.gold);
  for (let x = 435; x < 452; x += 5) rect(x, 456, 2, 6, HC.lacD);
  wallShelf(395, 430, 410, 'books');
  wallShelf(435, 475, 370, 'bonsai');
  wallShelf(560, 600, 285, 'books');
  wallShelf(610, 650, 240, 'bonsai');
  wallShelf(650, 690, 200, 'bell');                             // 最高处的小铜铃
  // 星图手卷：星星连成线，盖一个红印
  const x = 590, y = 350, w = 65, h = 45;
  rect(x - 3, y, 3, h, HC.wdk); rect(x + w, y, 3, h, HC.wdk);
  boxO(x, y, w, h, HC.paper); rect(x + 1, y + h - 2, w - 2, 1, HC.paperDk);
  const stars = [[8, 10], [16, 16], [26, 12], [34, 22], [44, 18], [52, 30], [20, 32], [30, 36]];
  for (let i = 0; i < 5; i++){ const [a, b] = stars[i], [c, d] = stars[i + 1]; for (let k = 0; k <= 10; k++) dot(x + a + Math.round((c - a) * k / 10), y + b + Math.round((d - b) * k / 10), HC.paperDk); }
  for (const [a, b] of stars) { dot(x + a, y + b, HC.ink); dot(x + a + 1, y + b, HC.ink); }
  disc(x + 48, y + 9, 4, HC.blueLt); disc(x + 49, y + 8, 2, HC.porc);
  rect(x + w - 9, y + h - 9, 5, 5, HC.red);
}

/* ---------- 茶室：月洞窗、两盏灯笼、番茄钟挂轴、茶桌、地毯、通往阁楼的置物板 ---------- */
const LANTERNS = [[738, 334], [884, 334], [1415, 152]];   // 灯笼（顶端位置）：茶室两盏、阁楼一盏
function lanternArt(cx, top){
  rect(cx, A_CE + 9, 1, top - A_CE - 9, OUTL);
  rect(cx - 4, top, 9, 2, HC.goldDk); rect(cx - 4, top, 9, 1, HC.gold);
  for (let j = 0; j < 16; j++){
    const w = Math.round(7 * Math.sin((j + 0.5) / 16 * Math.PI)) + 1;
    rect(cx - w, top + 2 + j, w * 2 + 1, 1, OUTL);
    if (w > 1) rect(cx - w + 1, top + 2 + j, w * 2 - 1, 1, j < 5 ? HC.lanternLt : (j % 5 === 0 ? HC.lanternDk : HC.lantern));
  }
  rect(cx - 4, top + 18, 9, 2, HC.goldDk);
  rect(cx, top + 20, 1, 6, HC.red); dot(cx - 1, top + 26, HC.red); dot(cx + 1, top + 26, HC.red);
}
function drawTeaCorner(tc){
  // 地毯（主题色 + 金边）
  rect(870, 467, 120, 3, OUTL); rect(871, 467, 118, 2, tc.rug); rect(871, 468, 118, 1, tc.rugDk);
  for (let x = 874; x < 988; x += 5) dot(x, 467, HC.gold);
  for (const x of [867, 990]) for (let y = 467; y < 470; y += 2) rect(x, y, 3, 1, HC.gold);
  for (const [cx, top] of LANTERNS.slice(0, 2)) lanternArt(cx, top);
  // 番茄钟挂轴（倒计时数字在 drawHouseLive 里画）
  scroll(POMO_SCROLL[0], POMO_SCROLL[1], POMO_SCROLL[2], POMO_SCROLL[3]);
  // 茶桌 + 紫砂壶 + 两个杯子
  bevel(959, 455, 53, 4, HC.wl, HC.wh, HC.wd);
  boxO(961, 459, 49, 3, HC.wd);
  for (const x of [964, 1003]) boxO(x, 461, 4, 9, HC.wd);
  art(TEAPOT, TEAPOT_PAL, 978, 446);
  boxO(966, 450, 5, 5, HC.celadon);
  boxO(997, 450, 5, 5, HC.porc);
  // 墙角的青花大瓶，插一枝梅
  for (let j = 0; j < 22; j++){ const w = [3, 3, 4, 5, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5, 6, 6, 5, 4][j]; rect(1032 - w - 1, 448 + j, w * 2 + 3, 1, OUTL); rect(1032 - w, 448 + j, w * 2 + 1, 1, j % 7 === 3 ? HC.blue : HC.porc); }
  for (let i = 0; i < 22; i++) dot(1032 + Math.round(Math.sin(i * 0.3) * 3) - (i > 12 ? i - 12 : 0), 448 - i, HC.wdk);
  for (const [px, py] of [[1029, 432], [1024, 428], [1035, 438], [1020, 426]]) { dot(px, py, HC.pink); dot(px + 1, py, HC.pinkLt); dot(px, py + 1, HC.pinkDk); }
  // 通往阁楼的一排置物板
  wallShelf(1060, 1100, 430, 'books');
  wallShelf(1115, 1155, 390);
  wallShelf(1060, 1100, 350, 'bonsai');
  wallShelf(1115, 1155, 310);
}
const POMO_SCROLL = [899, 344, 26, 58];   // 番茄钟挂轴（x, y, 宽, 高）

/* ---------- 工作间：任务板、挂钟、绣墩、翘头书案、全息屏、铜机柜、宫灯台灯、矮柜 ---------- */
function drawStudy(){
  // 任务板：木框 + 钉着的小纸条（红印）
  bevel(1185, 340, 50, 38, HC.wm, HC.wl, HC.wd);
  rect(1188, 343, 44, 32, '#e6cfa6'); dither(1188, 343, 44, 32, '#d8bd8e');
  for (const [x, y] of [[1192, 347], [1207, 352], [1220, 346], [1197, 361]]){
    boxO(x, y, 11, 10, HC.paper); rect(x + 2, y + 4, 7, 1, HC.paperDk); rect(x + 2, y + 6, 5, 1, HC.paperDk); rect(x + 7, y + 6, 2, 2, HC.red);
  }
  // 挂钟（指针在 drawHouseLive 里按真实时间画）
  disc(1305, 330, 11, OUTL); disc(1305, 330, 10, HC.wm); disc(1305, 330, 8, HC.paper);
  for (const [dx, dy] of [[0, -7], [7, 0], [0, 7], [-7, 0]]) dot(1305 + dx, 330 + dy, OUTL);
  // 绣墩（能站：顶面 452）
  rect(1200, 452, 27, 18, OUTL); rect(1201, 453, 25, 16, HC.lac); rect(1201, 453, 25, 2, HC.gold); rect(1201, 467, 25, 2, HC.gold);
  for (let x = 1204; x < 1224; x += 5) rect(x, 458, 2, 6, HC.lacD);
  // 翘头书案（能站：顶面 435）+ 抽屉
  bevel(1237, 435, 117, 5, HC.wl, HC.wh, HC.wd);
  rect(1235, 433, 4, 3, OUTL); rect(1352, 433, 4, 3, OUTL); dot(1236, 434, HC.wl); dot(1354, 434, HC.wl);
  boxO(1240, 440, 5, 30, HC.wd); boxO(1347, 440, 5, 30, HC.wd);
  bevel(1292, 440, 55, 13, HC.wm, HC.wl, HC.wd); rect(1315, 445, 9, 3, OUTL); rect(1316, 446, 7, 1, HC.gold);
  // 铜机柜（桌下）
  bevel(1249, 441, 14, 29, HC.goldDk, HC.gold, '#7a5222');
  for (let y = 452; y < 466; y += 3) rect(1252, y, 8, 1, '#7a5222');
  // 全息屏（铜框，屏幕里的雨在 drawHouseLive 里画）+ 铜键盘、玉石、青瓷杯、宫灯台灯
  boxO(1254, 394, 37, 28, HC.goldDk); rect(1255, 395, 35, 1, HC.gold);
  rect(1257, 397, 31, 22, HC.jadeDk);
  boxO(1270, 422, 5, 10, HC.goldDk); boxO(1264, 431, 17, 4, HC.goldDk);
  boxO(1294, 431, 22, 4, HC.gold); for (let x = 1296; x < 1314; x += 2) dot(x, 432, HC.goldDk);
  boxO(1319, 432, 5, 3, HC.jade);
  boxO(1328, 428, 6, 7, HC.celadon); rect(1334, 430, 2, 1, OUTL); rect(1335, 431, 1, 2, OUTL); rect(1334, 433, 2, 1, OUTL);
  boxO(1338, 431, 11, 4, HC.wdk); rect(1342, 420, 2, 11, OUTL);
  rect(1337, 410, 13, 11, OUTL); rect(1338, 411, 11, 9, HC.lanternLt); rect(1338, 414, 11, 1, HC.lantern); rect(1338, 418, 11, 1, HC.lantern);
  rect(1336, 409, 15, 2, HC.wdk);
  // 矮柜（能站：顶面 430）
  bevel(1376, 430, 58, 4, HC.wl, HC.wh, HC.wd);
  boxO(1378, 434, 54, 36, HC.wm);
  rect(1381, 437, 48, 14, '#3e2219'); books(1381, 437, 48, 14, 3);
  bevel(1379, 451, 52, 3, HC.wl, HC.wh, HC.wd);
  rect(1381, 454, 48, 13, HC.lac); for (const x of [1394, 1415]) { rect(x, 458, 3, 4, HC.gold); }
}

/* ---------- 右边：格子窗旁的宫灯、两个蒲团、大青花盆里的竹子 ---------- */
function drawRightEnd(){
  boxO(1701, 466, 19, 4, HC.wdk);
  rect(1709, 420, 3, 46, OUTL); rect(1710, 420, 1, 46, HC.wm);
  rect(1699, 398, 23, 2, HC.wdk); rect(1701, 400, 19, 20, OUTL);
  rect(1702, 401, 17, 18, HC.lanternLt); rect(1702, 401, 1, 18, HC.lantern); rect(1718, 401, 1, 18, HC.lantern);
  rect(1709, 401, 1, 18, HC.wl); rect(1702, 409, 17, 1, HC.wl);
  rect(1699, 419, 23, 2, HC.wdk); for (const x of [1700, 1720]) { rect(x, 421, 1, 5, HC.red); }
  for (const [x, w] of [[1630, 27], [1657, 24]]){
    rect(x + 2, 462, w - 4, 8, OUTL); rect(x, 464, w, 6, OUTL); rect(x + 1, 465, w - 2, 4, HC.straw); rect(x + 3, 463, w - 6, 2, HC.straw);
    for (let k = x + 3; k < x + w - 3; k += 3) dot(k, 466, HC.strawDk);
  }
  // 大青花盆 + 竹子
  for (const [lx, h] of [[1742, 48], [1747, 58], [1752, 44], [1745, 36]]){
    for (let j = 0; j < h; j++){ dot(lx, 452 - j, j % 12 === 0 ? OUTL : HC.leafDk); dot(lx + 1, 452 - j, HC.leaf); }
    for (let k = 10; k < h; k += 9){ art(LEAF, LEAF_PAL, lx + 1, 452 - k - 3); art(LEAF.map(r => [...r].reverse().join('')), LEAF_PAL, lx - 5, 452 - k); }
  }
  for (let j = 0; j < 18; j++){ const w = 12 - Math.floor(j / 4); rect(1748 - w, 452 + j, w * 2 + 1, 1, OUTL); if (j && j < 17) rect(1749 - w, 452 + j, w * 2 - 1, 1, j % 6 === 3 ? HC.blue : HC.porc); }
}

/* ---------- 阁楼：木地板（能站）、朱漆栏杆、木床、樟木箱、灯笼、一摞线装书、小地毯 ---------- */
function drawMezzanine(tc){
  bevel(A_MX, A_MZ, A_WR - A_MX, 8, HC.wm, HC.wl, HC.wd);
  for (let x = A_MX + 20; x < A_WR; x += 40) rect(x, A_MZ + 2, 1, 4, HC.wd);
  for (let x = A_MX + 30; x < A_WR - 10; x += 60) art(['kmmmmk', 'kmmmk.', 'kmmk..', 'kmk...', 'kk....'], PW, x, A_MZ + 17);
  // 栏杆
  bevel(A_MX, A_MZ - 23, 34, 3, HC.lac, HC.lacL, HC.lacD);
  for (let x = A_MX + 2; x < A_MX + 32; x += 7) boxO(x, A_MZ - 20, 3, 20, HC.lac);
  rect(A_MX + 1, A_MZ - 11, 32, 2, HC.gold);
  // 木床（能站：顶面 260）
  bevel(1572, 226, 9, 54, HC.lac, HC.lacL, HC.lacD); rect(1571, 224, 11, 3, HC.gold);
  bevel(1575, 266, 108, 7, HC.wm, HC.wl, HC.wd);
  for (const x of [1578, 1676]) boxO(x, 273, 5, 7, HC.wd);
  boxO(1579, 261, 103, 6, HC.white);
  boxO(1581, 255, 17, 7, HC.white); rect(1583, 260, 13, 1, HC.paperDk);
  rect(1598, 260, 85, 9, OUTL); rect(1599, 261, 83, 7, HC.pinkLt); rect(1599, 266, 83, 1, HC.pink);
  for (let x = 1608; x < 1680; x += 12) rect(x, 262, 1, 4, HC.pink);
  rect(1682, 261, 2, 12, OUTL); rect(1682, 261, 1, 11, HC.pinkLt);
  // 樟木箱（能站：顶面 260 / 240）
  bevel(1200, 260, 31, 20, HC.wm, HC.wl, HC.wd); rect(1201, 266, 29, 1, HC.wd);
  for (const [x, y] of [[1201, 261], [1227, 261], [1201, 276], [1227, 276]]) rect(x, y, 3, 3, HC.gold);
  rect(1213, 264, 5, 4, HC.gold);
  bevel(1230, 240, 27, 40, HC.lac, HC.lacL, HC.lacD); rect(1231, 247, 25, 1, HC.lacD);
  for (const [x, y] of [[1231, 241], [1253, 241], [1231, 276], [1253, 276]]) rect(x, y, 3, 3, HC.gold);
  rect(1241, 252, 5, 5, HC.gold); dot(1243, 254, HC.goldDk);
  lanternArt(...LANTERNS[2]);
  // 一摞线装书 + 小地毯
  bookStack(1487, 280, 4, 2);
  rect(1308, 278, 104, 2, OUTL); rect(1309, 278, 102, 1, tc.rug); for (let x = 1312; x < 1410; x += 5) dot(x, 278, HC.gold);
}

/* ============================================================
   窗外远景：星海 + 穹顶里的庭院（一张宽图，跟着镜头只移动一半）
   从窗户里看出去：上面是星空和行星，下面是庭院的白墙黛瓦和竹子
   ============================================================ */
const FAR_W = 1200, FAR_H = 340;
const farCv = (() => {
  const c = pxCanvas(FAR_W, FAR_H), keep = PG;
  PG = c.getContext('2d');
  const sky = ['#0f1433', '#141a3e', '#1a2048', '#212658', '#292d63', '#33336c', '#3f3a76'];
  sky.forEach((col, i) => { rect(0, i * 30, FAR_W, 30, col); if (i) dither(0, i * 30 - 2, FAR_W, 4, sky[i - 1], i); });
  rect(0, sky.length * 30, FAR_W, FAR_H, sky[sky.length - 1]);
  // 星云
  for (const [cx, cy, r, col] of [[430, 140, 46, 'rgba(120,80,150,0.10)'], [820, 90, 40, 'rgba(70,120,140,0.10)'], [980, 150, 50, 'rgba(120,80,150,0.08)'], [160, 120, 44, 'rgba(70,120,140,0.08)']]){
    for (let k = r; k > 0; k -= 7) disc(cx, cy, k, col);
  }
  // 星星
  for (let i = 0; i < 520; i++){
    const x = Math.floor(hash(i * 2.1) * FAR_W), y = Math.floor(hash(i * 5.3) * 200), b = hash(i * 9.7);
    dot(x, y, b > 0.75 ? '#fff6d8' : (b > 0.4 ? '#cfd8f5' : '#7d84b5'));
  }
  // 带环的行星（茶室月洞窗里看得到）+ 阁楼圆窗里的小月亮
  planet(452, 160, 22);
  disc(800, 108, 7, '#d8d6e6'); disc(802, 106, 5, '#efedf6'); dot(798, 110, '#b9b6cc');
  disc(560, 120, 3, '#e6c79a');
  // 漂浮的小岛 + 楼阁（人造小行星上的住处）
  for (const [cx, cy, w] of [[380, 186, 16], [520, 194, 11], [690, 182, 13], [880, 190, 15], [1010, 184, 12], [240, 190, 12]]) isle(cx, cy, w);
  // 穹顶的骨架线（淡淡的）
  for (let x = 0; x < FAR_W; x++){
    const y1 = Math.round(60 + 40 * Math.cos(x / FAR_W * TAU * 2));
    PG.fillStyle = 'rgba(160,180,255,0.10)'; PG.fillRect(x, y1, 1, 1);
  }
  // 庭院：黛瓦 + 白墙 + 小灯 + 竹子
  rect(0, 206, FAR_W, 6, '#3b3a5c');
  for (let x = 0; x < FAR_W; x += 4){ rect(x, 206, 3, 6, '#4c4b72'); dot(x, 206, '#6a6994'); }
  rect(0, 211, FAR_W, 1, '#1d1a33');
  rect(0, 212, FAR_W, FAR_H - 212, '#7d7898'); rect(0, 236, FAR_W, FAR_H - 236, '#686382');
  for (let x = 30; x < FAR_W; x += 110){ disc(x, 222, 6, 'rgba(255,176,112,0.18)'); rect(x - 1, 219, 3, 5, '#ff7a45'); dot(x, 218, '#2a1a14'); }
  for (let i = 0; i < 46; i++){
    const bx = Math.floor(hash(i * 4.4) * FAR_W), h = 40 + Math.floor(hash(i * 6.1) * 50), lean = (hash(i * 8.2) - 0.5) * 0.1;
    for (let j = 0; j < h; j++){
      const x = Math.round(bx + lean * j), y = 250 - j;
      dot(x, y, '#2f5a46'); dot(x + 1, y, '#4c7f5e'); if (j % 14 === 0){ dot(x, y, '#1d3a2c'); dot(x + 1, y, '#1d3a2c'); }
      if (j > h - 28 && j % 7 === 0) for (let t = 0; t < 5; t++){ dot(x + 2 + t, y - (t >> 1), '#2f5a46'); dot(x - 1 - t, y - (t >> 1) + 1, '#4c7f5e'); }
    }
  }
  rect(0, 250, FAR_W, FAR_H - 250, '#2b2a44');
  PG = keep;
  return c;
})();
function planet(cx, cy, r){
  disc(cx, cy, r + 1, '#2a1a14'); disc(cx, cy, r, '#e8a36a');
  for (const [yy, col] of [[-14, '#f6cf95'], [-6, '#b9693f'], [3, '#f6cf95'], [10, '#b9693f']]){
    for (let dy = 0; dy < 2; dy++){ const y = yy + dy, dx = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); PG.fillStyle = col; PG.globalAlpha = 0.55; PG.fillRect(cx - dx, cy + y, dx * 2, 1); PG.globalAlpha = 1; }
  }
  for (let dy = -r; dy <= r; dy++){ const dx = Math.round(Math.sqrt(r * r - dy * dy)); PG.fillStyle = 'rgba(120,60,40,0.5)'; PG.fillRect(cx + dx - 8, cy + dy, 8, 1); }
  for (let i = 0; i < 360; i++){
    const a = i / 360 * TAU, x = Math.round(cx + Math.cos(a) * 38), y = Math.round(cy + Math.sin(a) * 7 - Math.cos(a) * 3);
    if (Math.sin(a) > 0 || Math.abs(x - cx) > r){ dot(x, y, '#f6dfb0'); dot(x, y + 1, '#b07a30'); }
  }
}
function isle(cx, cy, w){
  for (let k = 0; k < 7; k++) rect(cx - w + k * 2, cy + k, (w - k * 2) * 2, 1, k ? '#2a2550' : '#3a3466');
  rect(cx - 6, cy - 8, 12, 8, '#1d1a33');
  rect(cx - 9, cy - 10, 18, 2, '#1d1a33'); dot(cx - 10, cy - 11, '#1d1a33'); dot(cx + 9, cy - 11, '#1d1a33');
  rect(cx - 4, cy - 14, 8, 4, '#1d1a33'); rect(cx - 6, cy - 15, 12, 1, '#1d1a33');
  dot(cx - 2, cy - 5, '#ffbb67'); dot(cx - 2, cy - 4, '#ffbb67'); dot(cx + 2, cy - 5, '#ffbb67');
}
/* 雨丝（穹顶里的人工雨）：在远景层上，所以只在窗户里看得见 */
const RAIN = Array.from({ length: 150 }, (_, i) => ({ x: hash(i * 3.1) * 460, y: hash(i * 7.7) * 270, v: 120 + hash(i * 1.3) * 60 }));

/* 灯光：抖动的半透明光圈（预先画好） */
function makeGlow(r, col){
  const c = pxCanvas(r * 2 + 1, r * 2 + 1), keep = PG;
  PG = c.getContext('2d');
  disc(r, r, Math.round(r * 0.55), col);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++){
    const d = dx * dx + dy * dy;
    if (d > r * r * 0.3 && d <= r * r && ((dx + dy) & 1) === 0) dot(r + dx, r + dy, col);
  }
  PG = keep;
  return c;
}
const GLOW_S = makeGlow(16, 'rgba(255,200,130,0.28)'), GLOW_L = makeGlow(30, 'rgba(255,180,110,0.22)');

/* ============================================================
   每帧：远景 + 房子（换主题时一格一格溶解过去）+ 会动的小东西
   g 是低分辨率画布；ix / iy 是镜头左上角（整数像素）
   ============================================================ */
let mixCv = null;
function drawHouseLayer(g, ix, iy, w, h){
  if (!houseCv || houseTheme !== themeIdx) buildHouse();
  if (houseOld && washT < 1){
    g.drawImage(houseOld, ix, iy, w, h, 0, 0, w, h);
    if (!mixCv || mixCv.width !== w || mixCv.height !== h) mixCv = pxCanvas(w, h);
    const m = mixCv.getContext('2d');
    m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, w, h);
    m.drawImage(houseCv, ix, iy, w, h, 0, 0, w, h);
    m.globalCompositeOperation = 'destination-in';
    m.fillStyle = m.createPattern(bayerMasks[Math.min(16, Math.floor(easeW(washT) * 17))], 'repeat');
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = 'source-over';
    g.drawImage(mixCv, 0, 0);
  } else {
    houseOld = null;
    g.drawImage(houseCv, ix, iy, w, h, 0, 0, w, h);
  }
}
/* 一闪一闪的大星星（远景坐标） */
const TWINKLE = [[400, 120], [470, 128], [610, 96], [760, 118], [840, 80], [930, 130], [300, 140], [1040, 100]];
function drawFar(g, t, ix, iy, w, h){
  // 镜头里一个窗户都没有：远景和雨丝都会被房子整个挡住，干脆不画
  if (!WINDOWS.some(([x, y, ww, wh]) => x < ix + w && x + ww > ix && y < iy + h && y + wh > iy)) return;
  const fx = Math.floor(ix * FAR_PAR), fy = Math.floor(iy * FAR_PAR * 0.6);
  g.drawImage(farCv, fx, fy, w, h, 0, 0, w, h);
  PG = g;
  TWINKLE.forEach(([sx, sy], k) => {
    const b = (t * 1.5 + k * 0.37) % 1, x = sx - fx, y = sy - fy;
    if (b < 0.5){ dot(x, y, '#fff6d8'); if (b > 0.15 && b < 0.35) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + dx, y + dy, 'rgba(255,246,216,0.5)'); }
  });
  // 镖船：挂着小红旗，慢慢飞过
  const sx = ((t * 6) % 1400) - 100 - fx, sy = 168 - fy;
  rect(sx, sy, 14, 3, '#1d1a33'); rect(sx + 2, sy - 2, 8, 2, '#1d1a33'); rect(sx + 4, sy - 6, 1, 4, '#1d1a33');
  rect(sx + 5, sy - 6, 4, 2, '#c0392b'); dot(sx + 13, sy + 1, '#ffbb67'); dot(sx, sy + 1, '#ff7a45');
  g.fillStyle = 'rgba(200,214,250,0.55)';
  for (const d of RAIN){
    const y = (d.y + t * d.v) % 270 - 10, x = ((d.x - t * d.v * 0.12 - fx) % 460 + 460) % 460 - 6;
    g.fillRect(Math.round(x), Math.round(y), 1, 3);
  }
}
/* 番茄钟挂轴上要显示的时间：没开番茄时显示下一段的完整时长 */
function pomoText(){
  if (typeof Pomo === 'undefined' || !Store.data) return ['25:00', 0];
  return Pomo.display();   // 番茄钟 / 计时器是倒数，正计时是往上数
}
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};
function drawHouseLive(g, t, ix, iy){
  PG = g;
  const X = x => x - ix, Y = y => y - iy;
  // 番茄钟挂轴：分、秒各一行，下面一条朱红的进度
  const [px, py, pw] = POMO_SCROLL;
  if (X(px) < 460 && X(px + pw) > 0 && Y(py) < 260 && Y(py + 60) > 0){
    const [txt, frac] = pomoText(), running = typeof Pomo !== 'undefined' && Pomo.t.running;
    txt.split(':').forEach((part, row) => {   // 第一行分、第二行秒；分钟可能是三位数（时长最多 180 分钟）
      const x0 = px + Math.round((pw - part.length * 8 + 2) / 2);
      [...part].forEach((ch, i) => DIGITS[ch].forEach((r, j) => { for (let k = 0; k < 3; k++) if (r[k] === '#') rect(X(x0 + i * 8 + k * 2), Y(py + 7 + row * 14 + j * 2), 2, 2, HC.ink); }));
    });
    if (!running || (t % 1) < 0.5){ dot(X(px + 12), Y(py + 27), HC.red); }
    rect(X(px + 4), Y(py + 48), pw - 8, 2, HC.paperDk); rect(X(px + 4), Y(py + 48), Math.round((pw - 8) * frac), 2, HC.red);
    rect(X(px + pw - 9), Y(py + 52), 4, 4, HC.red);
  }
  // 门口的控制面板：屏幕上一个小齿轮在发光，指示灯一闪一闪；鼠标指着时整块亮起来；rabbit 在旁边时冒一个 E 键提示
  {
    const [cx, cy, cw, ch] = CTRL, x = X(cx), y = Y(cy), hot = typeof Room !== 'undefined' && (Room.hover === 'panel' || Room.nearPanel);
    if (x > -30 && x < 470 && y > -30 && y < 270){
      const gear = ['.#.#.', '#####', '##.##', '#####', '.#.#.'];
      gear.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') dot(x + 5 + i, y + 4 + j, hot ? '#e8fff6' : HC.jadeLt); });
      if (hot) rect(x + 3, y + 3, cw - 6, 7, 'rgba(166,227,200,0.25)');
      dot(x + cw - 3, y + 14, (t % 1.6) < 1.2 ? '#8fe07e' : '#3f6a3a');
      if (hot){ rect(x - 1, y - 1, cw + 2, 1, HC.goldLt); rect(x - 1, y + ch, cw + 2, 1, HC.goldLt); rect(x - 1, y, 1, ch, HC.goldLt); rect(x + cw, y, 1, ch, HC.goldLt); }
      if (typeof Room !== 'undefined' && Room.nearPanel){
        const ky = y - 13 + Math.round(Math.sin(t * 4)), kx = x + 3;
        rect(kx + 1, ky, 7, 9, OUTL); rect(kx, ky + 1, 9, 7, OUTL); rect(kx + 1, ky + 1, 7, 7, HC.white); rect(kx + 1, ky + 7, 7, 1, HC.paperDk);
        rect(kx + 3, ky + 2, 1, 5, OUTL); rect(kx + 3, ky + 2, 3, 1, OUTL); rect(kx + 3, ky + 4, 2, 1, OUTL); rect(kx + 3, ky + 6, 3, 1, OUTL);
      }
    }
  }
  // 全息屏里在下雨 + 闪烁的光标
  const sx = X(1257), sy = Y(397);
  for (let i = 0; i < 10; i++){
    const rx = sx + 1 + ((i * 13) % 29), ry = sy + Math.floor((t * 24 + i * 11) % 26) - 3;
    if (ry >= sy && ry + 2 < sy + 22) rect(rx, ry, 1, 2, HC.jadeLt);
  }
  if ((t % 1) < 0.5) rect(sx + 3, sy + 17, 3, 1, HC.jadeLt);
  // 挂钟：真实时间
  const now = new Date(), cx = X(1305), cy = Y(330);
  const hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * TAU, mn = (now.getMinutes() + now.getSeconds() / 60) / 60 * TAU;
  for (let i = 1; i <= 4; i++) dot(cx + Math.round(Math.sin(hr) * i), cy - Math.round(Math.cos(hr) * i), OUTL);
  for (let i = 1; i <= 6; i++) dot(cx + Math.round(Math.sin(mn) * i), cy - Math.round(Math.cos(mn) * i), HC.wd);
  dot(cx, cy, HC.red);
  // 铜机柜的小玉灯
  dot(X(1255), Y(446), (t % 2.4) < 2 ? HC.jadeLt : HC.jadeDk);
  // 茶的热气：一缕一缕往上飘
  for (let k = 0; k < 2; k++){
    const ph = (t * 0.45 + k * 0.5) % 1;
    if (ph < 0.8) dot(X(984) + Math.round(Math.sin(ph * 9 + k) * 1.5), Y(443) - Math.floor(ph * 14), `rgba(255,255,255,${(0.8 - ph) * 0.9})`);
  }
  // 灯笼 / 宫灯 / 台灯的光（轻轻闪）
  for (const [k, [lx, ly]] of LANTERNS.entries()){ g.globalAlpha = 0.8 + Math.sin(t * 2.2 + k) * 0.12; g.drawImage(GLOW_L, X(lx) - 30, Y(ly + 11) - 30); }
  g.globalAlpha = 0.85 + Math.sin(t * 2) * 0.1;   g.drawImage(GLOW_S, X(1343) - 16, Y(415) - 16);
  g.globalAlpha = 0.85 + Math.sin(t * 1.7) * 0.1; g.drawImage(GLOW_L, X(1710) - 30, Y(410) - 30);
  g.globalAlpha = 1;
}

/* ============================================================
   前景（离镜头最近）：比中景多移动 FG_PAR，颜色深一点
   位置按「镜头正对着它时它在哪」来摆；在屏幕上画（已经按像素缩放好）
   ============================================================ */
const FGC = { ol: '#1c1012', wood: '#5a1e1c', woodLt: '#7a2a24', woodDk: '#3e1414', gold: '#8a6a30', leaf: '#3f5e45', leafLt: '#557a5a', leafDk: '#2e4634', pot: '#2c3a5e', potLt: '#4a5a86', potW: '#8f96ad' };
const FG_PILLAR = (() => {
  const h = VIEW_H / PX + 40, c = pxCanvas(18, h), keep = PG;
  PG = c.getContext('2d');
  rect(0, 0, 18, h, FGC.ol); rect(1, 0, 16, h, FGC.wood); rect(3, 0, 2, h, FGC.woodLt); rect(14, 0, 2, h, FGC.woodDk);
  for (let y = 30; y < h; y += 70){ rect(0, y, 18, 4, FGC.ol); rect(1, y + 1, 16, 2, FGC.gold); }
  PG = keep;
  return c;
})();
function makeIvy(n, seed){
  const c = pxCanvas(24, n * 10 + 8), keep = PG;
  PG = c.getContext('2d');
  for (let i = 0; i < n * 10; i++) dot(12 + Math.round(Math.sin(i * 0.13 + seed) * 3), i, FGC.leafDk);
  for (let i = 1; i <= n; i++){
    const y = i * 10 - 4, x = 12 + Math.round(Math.sin(y * 0.13 + seed) * 3), side = i % 2 ? 1 : -1;
    const lx = side > 0 ? x + 1 : x - 6;
    rect(lx, y, 6, 3, FGC.ol); rect(lx + 1, y - 1, 4, 5, FGC.ol); rect(lx + 1, y, 4, 3, FGC.leaf); dot(lx + (side > 0 ? 2 : 3), y, FGC.leafLt);
  }
  PG = keep;
  return c;
}
const FG_IVY = [[150, A_CE + 9, 7], [590, A_CE + 9, 6], [1500, A_CE + 9, 8], [1025, A_MZ + 17, 5]].map(([x, y, n], i) => ({ x, y, c: makeIvy(n, i * 2.3) }));
const FG_POT = (() => {   // 前景的大青花瓶，插着竹子
  const c = pxCanvas(40, 64), keep = PG;
  PG = c.getContext('2d');
  for (const [x0, h, lean] of [[13, 44, -0.18], [17, 54, -0.05], [21, 50, 0.08], [25, 40, 0.2], [19, 34, -0.3]]){
    for (let j = 0; j < h; j++){
      const x = Math.round(x0 + lean * j), w = j < h - 6 ? 1 : 0, y = 44 - j;
      rect(x - w - 1, y, w * 2 + 3, 1, FGC.ol);
      if (w) rect(x - w, y, w * 2 + 1, 1, j % 9 < 2 ? FGC.leafLt : FGC.leaf);
      if (j > 10 && j % 8 === 0){ rect(x + 1, y - 1, 4, 2, FGC.leaf); rect(x - 4, y, 4, 2, FGC.leafDk); }
    }
  }
  for (let j = 0; j < 20; j++){ const w = [8, 9, 10, 11, 12, 12, 13, 13, 13, 13, 12, 12, 11, 11, 10, 10, 10, 11, 11, 10][j]; rect(20 - w, 44 + j, w * 2 + 1, 1, FGC.ol); if (j && j < 19) rect(21 - w, 44 + j, w * 2 - 1, 1, j % 6 === 3 ? FGC.potW : FGC.pot); }
  PG = keep;
  return c;
})();
/* camX / camY：镜头左上角（像素，可以是小数）；q：对齐到屏幕像素的取整 */
function drawForeground(c2, t, camX, camY, q){
  const VW = VIEW_W / PX, VH = VIEW_H / PX;
  const at = (ax, ay) => [q((ax - camX) + (ax - camX - VW / 2) * FG_PAR), q((ay - camY) + (ay - camY - VH / 2) * FG_PAR * 0.4)];
  for (const v of FG_IVY){
    const [x, y] = at(v.x, v.y);
    if (x < -30 || x > VW + 30) continue;
    c2.drawImage(v.c, x - 12 + Math.round(Math.sin(t * 0.9 + v.x)), y);
  }
  for (const ax of [700, 1490]){
    const [x] = at(ax, 0);
    if (x < -30 || x > VW + 30) continue;
    c2.drawImage(FG_PILLAR, x - 9, -20);
  }
  for (const ax of [300, 1170, 1590]){
    const [x, y] = at(ax, A_FL);
    if (x < -40 || x > VW + 40) continue;
    c2.drawImage(FG_POT, x - 20, y - 54);
  }
}
