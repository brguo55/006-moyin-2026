"use strict";
/* ============================================================
   house.js：国风 + 星海的像素小屋（整张地图 1800 × 500 像素，1 像素 = 2 世界单位）
   ------------------------------------------------------------
   rabbit 住在一颗人造小行星上：屋子是温暖的中式木构（红漆柱、回纹、灯笼、博古架、挂轴），
   窗外是穹顶里的庭院（白墙黛瓦、竹子，下着人工雨），再往外是星海（行星、漂浮小岛上的楼阁、镖船）
   分层（从远到近）：
     窗外远景（星海 + 庭院，跟着镜头只移动一半；白天 / 傍晚 / 夜里三张，按真实时间一格一格溶过去）+ 雨丝
     房子（静态：墙、地板、家具 —— 预先画好一整张；窗户是透明的，透出后面的远景；换节气时重画瓶花和小摆设）
     会动的小东西（挂轴上的番茄钟、日历、音箱、电脑屏幕里的雨、电子钟、茶的热气）
     人物（room.js 画）
     前景（红漆柱、垂下来的藤、大瓷瓶：比中景移动得快 → 景深）
     天光（夜里整个画面暗一点、灯笼亮起来；傍晚带点橘色）—— drawLights，最后叠上去
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
   摆设：每样东西一个名字（id），写着它在地图上的位置和大小（像素，x, y 是左上角）
   现在全是代码画的。以后老师照着 docs/art-brief/props/ 里同名的图画一张一样大的透明 PNG，
   放进 assets/house/<id>.png，再把 id 加进 PROP_ART，程序就改用老师的图（不用改画法）
   会动的部分（电子钟的数字、日历的日期、番茄钟、屏幕里的雨、音箱的音符……）还是程序画在图上面
   窗户：玻璃那块要留透明（形状、大小和现在一样），程序先把玻璃挖空再贴图，窗外的天色才透得出来
   ============================================================ */
const PROPS = {
  door:           { name: '格扇门（连横批、对联、门槛）', at: [37, 380], size: [73, 90] },
  umbrella:       { name: '油纸伞和青花瓷缸', at: [107, 427], size: [15, 43] },
  coat_rack:      { name: '衣帽架（粉斗篷、斗笠）', at: [122, 397], size: [25, 73] },
  shoe_bench:     { name: '鞋凳和两只靴子（顶面能站）', at: [165, 456], size: [51, 14] },
  calendar:       { name: '撕页日历（几月几号、星期由程序画）', at: [170, 383], size: [24, 36] },
  dummy:          { name: '木人桩', at: [300, 388], size: [39, 82] },
  control_panel:  { name: '控制面板（屏上的齿轮、指示灯由程序画）', at: [150, 408], size: [16, 21] },
  plaque:         { name: '匾（连两根吊绳）', at: [190, 19], size: [86, 42] },
  bamboo_painting:{ name: '竹子画挂轴', at: [986, 37], size: [38, 122] },
  speaker:        { name: '音箱（连两根铜链；放声音时的音符、指示灯由程序画）', at: [26, 10], size: [26, 46] },
  fan_window:     { name: '扇面窗（玻璃留透明）', at: [286, 100], size: [89, 49], window: true },
  bookcase_1:     { name: '书柜 1（矮的那个，顶面能站）', at: [442, 400], size: [100, 70] },
  bookcase_2:     { name: '书柜 2（高的那个，顶面能站）', at: [550, 326], size: [128, 144] },
  step_stool:     { name: '踏凳（顶面能站）', at: [446, 450], size: [26, 20] },
  star_chart:     { name: '星图手卷', at: [597, 92], size: [71, 45] },
  moon_window:    { name: '月洞窗和窗台（玻璃留透明，窗台能站）', at: [824, 311], size: [112, 118], window: true },
  lantern:        { name: '灯笼（三盏用同一张；吊绳、墙钩由程序画；夜里的光由程序画）', size: [17, 27] },
  pomo_scroll:    { name: '番茄钟挂轴（上面的数字和进度由程序画）', at: [968, 337], size: [34, 68] },
  tea_table:      { name: '茶桌、紫砂壶、两个杯子（顶面能站；热气由程序画）', at: [712, 446], size: [53, 24] },
  vase:           { name: '青花大瓶（插的花跟着节气换，由程序画）', at: [779, 448], size: [17, 22] },
  task_board:     { name: '任务板', at: [1058, 340], size: [50, 38] },
  e_clock:        { name: '电子钟（数字由程序画，屏要留深色）', at: [1164, 318], size: [30, 16] },
  drum_stool:     { name: '绣墩（顶面能站）', at: [1073, 452], size: [27, 18] },
  desk:           { name: '翘头书案、抽屉、桌下的铜机柜（顶面能站；机柜的小灯由程序画）', at: [1108, 433], size: [121, 37] },
  computer:       { name: '电脑（屏、支架、键盘、鼠标；屏里的雨和光标由程序画）', at: [1127, 394], size: [62, 41] },
  desk_things:    { name: '书案上的玉石和青瓷杯', at: [1192, 428], size: [17, 7] },
  desk_lamp:      { name: '宫灯台灯（夜里的光由程序画）', at: [1209, 409], size: [15, 26] },
  armillary:      { name: '浑天仪（铜座、三道铜环、玉色小球）', at: [1320, 406], size: [31, 64] },
  cabinet:        { name: '抽屉柜（顶面能站）', at: [1380, 397], size: [60, 73] },
  lattice_window: { name: '格子窗和窗台（玻璃留透明，窗台能站）', at: [1474, 334], size: [96, 89], window: true },
  palace_lantern: { name: '落地宫灯（夜里的光由程序画）', at: [1659, 398], size: [23, 72] },
  cushions:       { name: '两个蒲团', at: [1490, 462], size: [51, 8] },
  bamboo_pot:     { name: '青花盆里的竹子', at: [1736, 394], size: [25, 76] },
  railing:        { name: '阁楼的栏杆', at: [1040, 257], size: [34, 23] },
  wardrobe:       { name: '衣柜（顶面能站）', at: [1422, 200], size: [56, 80] },
  bed:            { name: '木床（顶面能站）', at: [1571, 224], size: [113, 56] },
  chests:         { name: '两个樟木箱（顶面能站）', at: [1084, 240], size: [57, 40] },
  round_window:   { name: '阁楼的小圆窗（玻璃留透明）', at: [1269, 149], size: [63, 63], window: true },
  loft_window:    { name: '阁楼床上方的格子窗（玻璃留透明）', at: [1584, 144], size: [88, 73], window: true },
};
const PROP_ART = [];   // 已经有老师画的图的摆设 id（图放在 assets/house/；也要加进 sw.js 的 SHELL，断网时才有）
const propImgs = {};
for (const id of PROP_ART){
  const img = new Image();
  img.onload = () => { houseCv = null; };   // 图到了：重画房子
  img.src = 'assets/house/' + id + '.png';
  propImgs[id] = img;
}
let propLog = null;   // 导出参考图时用：记下每一次画了什么摆设
/* 画一样摆设：有老师的图就贴图，没有就用代码画（draw）。
   at：这一个摆在哪（同一张图摆好几处时用，比如灯笼）；glass：窗户的玻璃怎么挖空 */
function prop(id, draw, at, glass){
  if (propLog) propLog.push({ id, draw, at });
  const img = propImgs[id];
  if (!(img && img.complete && img.naturalWidth)) return draw();
  if (glass) glass();
  const [x, y] = at || PROPS[id].at;
  PG.drawImage(img, x, y);
}

/* ============================================================
   静态部分：整张地图画一次（换主题时重画）
   ============================================================ */
let houseCv = null, houseOld = null, houseTheme = -1, houseTerm = -1;
function buildHouse(){
  if (houseCv && houseTheme !== themeIdx){ houseOld = houseCv; houseCv = null; }
  houseCv = houseCv || pxCanvas(AW, AH);
  paintHouse(houseCv.getContext('2d'));
  houseTheme = themeIdx; houseTerm = currentTerm().i;
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
  // 窗：门口上面的扇面窗、窗户那块的月洞窗、电脑旁的格子窗、阁楼的小圆窗（玻璃留透明；阁楼的格子窗在 drawMezzanine）
  prop('fan_window', () => fanWindow(...FAN), null, () => fanGlass(...FAN));
  prop('moon_window', () => moonGate(...MOON), null, () => clearDisc(MOON[0], MOON[1], MOON[2]));
  prop('lattice_window', () => latticeWindow(...LATTICE), null, () => PG.clearRect(...LATTICE));
  prop('round_window', () => roundWindow(...ROUND), null, () => clearDisc(ROUND[0], ROUND[1], ROUND[2] - 1));
  // 红漆柱：四块之间各一根，从地板一直到屋顶
  for (const x of ZONES.slice(1, -1)) pillar(x - 4, A_CE + 6, A_FL - A_CE - 6, true);
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
  drawWindowNook(tc);
  drawStudy();
  drawRightEnd();
  drawMezzanine(tc);
  drawTraining();
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
/* 四块的分界（像素 x）：门口 | 书架 | 窗户 | 电脑（上面是阁楼） */
const ZONES = [A_WL, 420, 700, A_MX, A_WR];
/* 窗户 */
const FAN = [330, 150, 44, 14];                 // 门口上面的扇面窗：圆心 x、y，外半径、内半径（开口朝上，左右各张开 60°）
const MOON = [880, 366, 48];                    // 月洞窗：圆心 x、y，半径
const LATTICE = [1480, 340, 84, 76];            // 电脑旁边的格子窗（x, y, 宽, 高）
const ROUND = [1300, 180, 26];                  // 阁楼的小圆窗
const LOFT_WIN = [1590, 150, 76, 60];           // 阁楼床上方的格子窗
/* 窗户透明区域的外接框（x, y, 宽, 高）：镜头里一个都没有时就不画远景 */
const WINDOWS = [[MOON[0] - MOON[2], MOON[1] - MOON[2], MOON[2] * 2 + 1, MOON[2] * 2 + 1], LATTICE,
  [ROUND[0] - ROUND[2], ROUND[1] - ROUND[2], ROUND[2] * 2 + 1, ROUND[2] * 2 + 1], [FAN[0] - FAN[2], FAN[1] - FAN[2], FAN[2] * 2 + 1, FAN[2]], LOFT_WIN];
function clearDisc(cx, cy, r){
  for (let dy = -r; dy <= r; dy++){ const dx = Math.round(Math.sqrt(r * r - dy * dy)); PG.clearRect(cx - dx, cy + dy, dx * 2 + 1, 1); }
}
function glints(x, y, n){
  PG.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < n; i++) PG.fillRect(x + i, y - i, 1, 1);
}
/* 月洞窗：圆的木框 + 一圈金线；下面一块雕花窗台（能站：顶面 = 圆心 y + 54） */
function moonGate(cx, cy, r){
  disc(cx, cy, r + 7, OUTL); disc(cx, cy, r + 6, HC.wm);
  for (let a = 3.4; a < 5.0; a += 0.04) dot(cx + Math.round(Math.cos(a) * (r + 4)), cy + Math.round(Math.sin(a) * (r + 4)), HC.wl);
  disc(cx, cy, r + 2, HC.gold); disc(cx, cy, r + 1, OUTL);
  clearDisc(cx, cy, r);
  glints(cx - 30, cy - 4, 18); glints(cx - 24, cy, 8);
  bevel(cx - 56, cy + 54, 112, 5, HC.wl, HC.wh, HC.wd);   // 窗台（能站）
  for (const bx of [cx - 50, cx + 42]) art(BRACKET.map(s => bx > cx ? [...s].reverse().join('') : s), PW, bx, cy + 59);
  rect(cx - 40, cy + 59, 80, 2, OUTL); rect(cx - 39, cy + 59, 78, 1, HC.wd);
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
/* 扇面窗：一块扇形的透明玻璃；木框按「离玻璃几格」一圈一圈画：描边 → 金线 → 三层木头 → 描边 */
const fanInGlass = (cx, cy, ro, ri, x, y) => {
  const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) * 180 / Math.PI;
  return r >= ri && r <= ro && a >= -150 && a <= -30;
};
/* 扇面窗的玻璃挖空（换成老师的图时用） */
function fanGlass(cx, cy, ro, ri){
  for (let y = cy - ro; y <= cy; y++) for (let x = cx - ro; x <= cx + ro; x++) if (fanInGlass(cx, cy, ro, ri, x, y)) PG.clearRect(x, y, 1, 1);
}
function fanWindow(cx, cy, ro, ri){
  const x0 = cx - ro - 8, y0 = cy - ro - 8, w = ro * 2 + 17, hh = ro + 8;
  const inGlass = (x, y) => fanInGlass(cx, cy, ro, ri, x, y);
  const D = new Uint8Array(w * hh).fill(255), at = (x, y) => (y - y0) * w + (x - x0);
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) if (inGlass(x, y)) D[at(x, y)] = 0;
  for (let k = 1; k <= 6; k++) for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++){
    if (D[at(x, y)] !== 255) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const xx = x + dx, yy = y + dy;
      if (xx >= x0 && xx < x0 + w && yy >= y0 && yy < y0 + hh && D[at(xx, yy)] === k - 1) D[at(x, y)] = k;
    }
  }
  const COL = [null, OUTL, HC.gold, HC.wl, HC.wm, HC.wd, OUTL];
  for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++){
    const d = D[at(x, y)];
    if (d === 0) PG.clearRect(x, y, 1, 1); else if (d <= 6) dot(x, y, COL[d]);
  }
  glints(cx - 26, cy - 22, 10); glints(cx - 20, cy - 20, 5);
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
/* 左上角的音箱（点它，或者爬到它旁边那块板上按 E → 声音）、门边的日历（点它 → 月历）；
   置物板、练功的架子这些能站的位置在 room.js（SHELF_A / SHELF_B / SPEAKER_SHELF / TRAIN） */
const SPEAKER = [26, 22, 26, 34];                             // 音箱（x, y, 宽, 高）：从屋顶的梁上吊下来
const CAL = [170, 389, 24, 28];                               // 日历
const THINGS = [['panel', CTRL], ['calendar', CAL], ['speaker', SPEAKER]];   // 能互动的东西（room.js 判断点到 / 站到了哪个；这里画亮边）
/* ---------- 门口：格扇门、对联、油纸伞、衣帽架（斗笠 + 粉斗篷）、鞋凳、控制面板、日历、木人桩 ---------- */
function drawEntrance(){
  prop('door', () => {
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
  });
  // 青花瓷缸 + 收起来的油纸伞
  prop('umbrella', () => {
  rect(114, 428, 1, 26, HC.wdk); dot(113, 427, HC.wdk); dot(112, 427, HC.wdk); dot(111, 428, HC.wdk); dot(111, 429, HC.wdk);
  for (let y = 434; y < 454; y++){ const w = y < 438 ? 1 : (y < 448 ? 2 : 1); rect(114 - w - 1, y, w * 2 + 3, 1, OUTL); rect(114 - w, y, w * 2 + 1, 1, y % 5 ? HC.pink : HC.pinkDk); }
  for (let j = 0; j < 18; j++){ const w = 6 - Math.abs(8 - j) / 3 | 0; rect(114 - w - 1, 452 + j, w * 2 + 3, 1, OUTL); rect(114 - w, 452 + j, w * 2 + 1, 1, j % 6 === 3 ? HC.blue : HC.porc); }
  });
  // 衣帽架：粉斗篷、斗笠
  prop('coat_rack', () => {
  rect(134, 400, 4, 68, OUTL); rect(135, 401, 2, 66, HC.wd); rect(135, 401, 1, 66, HC.wm);
  rect(126, 466, 20, 4, OUTL); rect(127, 467, 18, 2, HC.wd);
  rect(133, 397, 6, 4, OUTL); rect(134, 398, 4, 2, HC.gold);
  rect(128, 405, 7, 1, OUTL); rect(137, 405, 7, 1, OUTL);
  art(CAPE, CAPE_PAL, 122, 405);
  art(HAT, HAT_PAL, 137, 401);
  });
  // 鞋凳（能站）+ 两只靴子
  prop('shoe_bench', () => {
  bevel(165, 456, 51, 4, HC.wl, HC.wh, HC.wd);
  for (const x of [168, 209]) boxO(x, 460, 4, 10, HC.wd);
  art(BOOT, BOOT_PAL, 176, 465); art(BOOT, BOOT_PAL, 188, 465);
  });
  // 两块置物板（下面那块摆着跟着节气换的小东西）、日历、木人桩
  wallShelf(SHELF_A[0], SHELF_A[1], SHELF_A[2]);
  seasonItem(SHELF_A[1] - 14, SHELF_A[2], termSeason(currentTerm().i));
  wallShelf(SHELF_B[0], SHELF_B[1], SHELF_B[2]);
  prop('calendar', wallCalendar);
  prop('dummy', () => woodenDummy(312));
  // 控制面板：铜框、玉色小屏幕（内容每帧画）、两个小按钮
  prop('control_panel', () => {
  const [cx, cy, cw, ch] = CTRL;
  rect(cx + 1, cy + ch, cw, 1, 'rgba(60,40,30,0.25)');                     // 一点点投影
  bevel(cx, cy, cw, ch, HC.goldDk, HC.gold, '#7a5222');
  rect(cx + 2, cy + 2, cw - 4, 9, OUTL); rect(cx + 3, cy + 3, cw - 6, 7, HC.jadeDk);
  for (const bx of [cx + 3, cx + 8]) { rect(bx, cy + 13, 4, 3, OUTL); rect(bx + 1, cy + 14, 2, 1, HC.wl); }
  });
}

/* 音箱：深色木箱、编织的网罩，上面一个小高音、下面一个铜圈的大低音，四角包铜，右下角一颗指示灯；
   放着声音的时候低音一鼓一鼓、指示灯亮起来、旁边飘出小音符（drawHouseLive） */
const SPK_CONE = (x, y, w, h) => [x + (w >> 1), y + h - 12];   // 低音的圆心
function speakerBox(x, y, w, h){
  bevel(x, y, w, h, HC.wd, HC.wm, HC.wdk);
  rect(x + 2, y + 2, w - 4, h - 4, '#2b1d18'); dither(x + 2, y + 2, w - 4, h - 4, '#3b2a22');   // 网罩
  const cx = x + (w >> 1), [, cy] = SPK_CONE(x, y, w, h);
  disc(cx, y + 8, 4, HC.goldDk); disc(cx, y + 8, 3, '#1d1416'); dot(cx, y + 8, '#5a4a44'); dot(cx - 1, y + 7, '#7a6a62');   // 高音
  disc(cx, cy, 9, HC.goldDk); disc(cx, cy, 8, HC.gold); disc(cx, cy, 7, '#1d1416');                                       // 低音的铜圈
  ring(cx, cy, 5, '#3a2e2a'); disc(cx, cy, 2, '#4a3c36'); dot(cx - 1, cy - 1, '#7a6a62');                                 // 折环、防尘帽
  for (const [dx, dy] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) dot(x + dx, y + dy, HC.gold);                // 包角
  dot(x + w - 4, y + h - 4, HC.jadeDk);                                                                                   // 指示灯（没放声音时暗着）
}
/* 木人桩：一根木桩，上面两只斜着往上的手、中间一只平手、下面一只弯着的脚，底下一块木座（练功用） */
function woodenDummy(x){
  bevel(x - 12, 464, 36, 6, HC.wd, HC.wm, HC.wdk);
  boxO(x, 388, 12, 77, HC.wm); rect(x + 2, 389, 2, 75, HC.wl); rect(x + 9, 389, 1, 75, HC.wd);
  rect(x + 1, 388, 10, 1, HC.wh);
  for (const y of [396, 430, 456]) rect(x + 1, y, 10, 2, HC.wdk);   // 铜箍
  const stick = (pts, w) => { for (let k = 0; k < w; k++) twig(pts.map(([a, b]) => [a, b + k]), k ? HC.wm : OUTL); };
  stick([[x + 11, 404], [x + 19, 399], [x + 24, 397]], 3);           // 上面两只手
  stick([[x + 11, 410], [x + 21, 406], [x + 26, 405]], 3);
  stick([[x + 11, 420], [x + 25, 420]], 3);                          // 中间的手
  stick([[x + 11, 444], [x + 18, 448], [x + 20, 458]], 3);           // 脚
}
/* 匾：深色木板、金边，中间一个金色的圆、两边各两朵祥云（纹样，不写字） */
const CLOUD = ['..kk.....', '.k..k.kk.', '.k.k.k..k', 'k..k..k.k', 'k...kk..k', '.kk....k.', '...kkkk..'];
function plaque(x, y){
  const w = 84, h = 19, cx = x + (w >> 1);
  rect(x + 2, y + h, w, 2, 'rgba(60,40,30,0.2)');
  boxO(x, y, w, h, '#2a1712'); rect(x + 2, y + 2, w - 4, 1, HC.goldDk); rect(x + 2, y + h - 3, w - 4, 1, HC.goldDk);
  rect(x + 2, y + 2, 1, h - 4, HC.goldDk); rect(x + w - 3, y + 2, 1, h - 4, HC.goldDk);
  ring(cx, y + 9, 5, HC.gold); disc(cx, y + 9, 2, HC.gold);
  const flip = r => [...r].reverse().join('');
  for (const [dx, f] of [[-34, 0], [-21, 0], [12, 1], [25, 1]]) art(f ? CLOUD.map(flip) : CLOUD, { k: HC.gold }, cx + dx, y + 6);
  for (const hx of [x + 10, x + w - 11]) rect(hx, A_CE + 9, 1, y - A_CE - 9, OUTL);   // 吊绳
}
/* 竹子画：一幅窄长的挂轴，画着三根竹子和几片叶子 */
function bambooScroll(x, y, w, h){
  scroll(x, y, w, h);
  for (const [bx, top] of [[x + 8, y + 10], [x + 14, y + 20], [x + 20, y + 6]]){
    for (let yy = top; yy < y + h - 6; yy++) dot(bx, yy, (yy - top) % 14 === 0 ? HC.leafDk : HC.leaf);
    for (let k = top + 6; k < y + h - 14; k += 13){ art(LEAF, LEAF_PAL, bx + 1, k); art(LEAF.map(r => [...r].reverse().join('')), LEAF_PAL, bx - 5, k + 5); }
  }
  rect(x + w - 7, y + h - 9, 4, 4, HC.red);   // 红印
}
/* 练功的架子（门口、书架、窗户上面，room.js 的 TRAIN）：一块块木板，有的上面摆点小东西；左上角吊着音箱；墙上一块匾、一幅竹子 */
const TRAIN_ITEMS = { 0: 'bonsai', 3: 'books', 4: 'bell', 6: 'books' };   // 第几块板上摆什么
function drawTraining(){
  prop('plaque', () => plaque(190, 40));
  prop('bamboo_painting', () => bambooScroll(990, 44, 30, 112));
  TRAIN.forEach(([x0, x1, y], i) => wallShelf(x0, x1, y, TRAIN_ITEMS[i]));
  prop('speaker', () => {
    const [x, y, w, h] = SPEAKER;
    for (const cx of [x + 5, x + w - 6]) for (let yy = A_CE; yy < y; yy++) dot(cx, yy, yy % 2 ? HC.goldDk : HC.gold);   // 两根铜链
    speakerBox(x, y, w, h);
  });
}
/* 撕页日历：钉子 + 挂绳、红色的月份条、白纸、下面一叠纸边（月、日、星期每帧画） */
function wallCalendar(){
  const [x, y, w, h] = CAL, nx = x + (w >> 1), ny = y - 5;
  for (let i = 0; i <= 5; i++){ dot(nx - Math.round(i * 2.2), ny + i, HC.wdk); dot(nx + Math.round(i * 2.2), ny + i, HC.wdk); }
  rect(nx - 1, ny - 1, 3, 2, OUTL); dot(nx, ny - 1, HC.gold);
  boxO(x, y, w, h, HC.white);
  rect(x + 1, y + 1, w - 2, 7, HC.red); rect(x + 1, y + 1, w - 2, 1, HC.redLt); rect(x + 1, y + 8, w - 2, 1, HC.lacD);
  rect(x + 1, y + h - 3, w - 2, 1, HC.paperDk);
  rect(x + 2, y + h, w - 4, 1, OUTL); rect(x + 3, y + h + 1, w - 6, 1, 'rgba(60,40,30,0.25)');
}

/* ---------- 跟着节气换的小装饰：茶桌旁的瓶花（九种）、门口置物板上的季节小物（四种） ---------- */
/* 一根折线枝条：pts 是 [x, y] 点列 */
function twig(pts, c){
  for (let i = 0; i + 1 < pts.length; i++){
    const [a, b] = pts[i], [c2, d] = pts[i + 1], n = Math.max(Math.abs(c2 - a), Math.abs(d - b));
    for (let k = 0; k <= n; k++) dot(a + Math.round((c2 - a) * k / n), b + Math.round((d - b) * k / n), c);
  }
}
const bloom = (x, y, c, lt, dk) => { dot(x, y, c); dot(x + 1, y, lt || c); dot(x, y + 1, dk || c); dot(x + 1, y + 1, c); };
function seasonVase(cx, top){
  const i = currentTerm().i, y = top;
  if (i === 23 || i <= 1){                                   // 冬至 – 大寒：梅花
    for (let k = 0; k < 22; k++) dot(cx + Math.round(Math.sin(k * 0.3) * 3) - (k > 12 ? k - 12 : 0), y - k, HC.wdk);
    for (const [px, py] of [[-3, -16], [-8, -20], [3, -10], [-12, -22], [-1, -21]]) bloom(cx + px, y + py, HC.pink, HC.pinkLt, HC.pinkDk);
  } else if (i <= 3){                                        // 立春、雨水：迎春花（弯下来的绿枝，小黄花）
    for (const dir of [-1, 1]) for (let k = 0; k < 18; k++){
      const px = cx + dir * Math.round(k * 0.7), py = y - Math.round(Math.sin(k / 17 * Math.PI) * 14) - (k < 3 ? k : 0);
      dot(px, py, HC.leafDk); if (k % 4 === 2) bloom(px, py - 1, HC.gold, HC.goldLt, HC.goldDk);
    }
  } else if (i <= 5){                                        // 惊蛰、春分：桃花
    twig([[cx, y], [cx - 2, y - 10], [cx - 6, y - 20]], HC.wdk); twig([[cx - 2, y - 10], [cx + 5, y - 18]], HC.wdk);
    for (const [px, py] of [[-6, -21], [-4, -15], [4, -19], [1, -13], [-8, -17], [6, -15]]) bloom(cx + px, y + py, HC.pinkLt, '#fde3e6', HC.pink);
    dot(cx - 3, y - 18, HC.leafLt); dot(cx + 3, y - 15, HC.leafLt);
  } else if (i <= 7){                                        // 清明、谷雨：柳枝（垂下来的细条）
    twig([[cx, y], [cx - 1, y - 18], [cx - 5, y - 22]], HC.wdk);
    for (const sx of [-5, -3, 0, 2]) for (let k = 0; k < 14; k++) dot(cx + sx + Math.round(Math.sin(k * 0.4) * 1.2) - (k > 8 ? 1 : 0), y - 21 + k, k % 3 ? HC.leafLt : HC.leaf);
  } else if (i <= 9){                                        // 立夏、小满：栀子花（深绿叶子，白花）
    twig([[cx, y], [cx - 1, y - 16]], HC.leafDk); twig([[cx, y - 8], [cx + 5, y - 14]], HC.leafDk);
    for (const [px, py] of [[-3, -12], [3, -10], [-4, -6], [6, -16]]){ dot(cx + px, y + py, HC.leaf); dot(cx + px + 1, y + py, HC.leafDk); }
    for (const [px, py] of [[-2, -18], [4, -16]]){ rect(cx + px, y + py, 3, 3, HC.white); dot(cx + px + 1, y + py + 1, HC.goldLt); }
  } else if (i <= 13){                                       // 芒种 – 大暑：荷花和一片圆荷叶
    twig([[cx, y], [cx - 1, y - 24]], HC.leafDk); twig([[cx + 1, y], [cx + 6, y - 14]], HC.leafDk);
    rect(cx - 3, y - 29, 5, 5, HC.pink); rect(cx - 2, y - 30, 3, 1, HC.pinkLt); dot(cx - 1, y - 27, HC.pinkLt); dot(cx - 3, y - 25, HC.pinkDk); dot(cx + 1, y - 25, HC.pinkDk);
    rect(cx + 2, y - 17, 9, 3, HC.leaf); rect(cx + 3, y - 18, 7, 1, HC.leafLt); dot(cx + 6, y - 16, HC.leafDk);
  } else if (i <= 17){                                       // 立秋 – 秋分：桂花（深绿叶子，一簇簇小黄花）
    twig([[cx, y], [cx - 2, y - 14], [cx - 7, y - 20]], HC.wdk); twig([[cx - 2, y - 14], [cx + 5, y - 20]], HC.wdk);
    for (const [px, py] of [[-7, -21], [-4, -16], [4, -21], [1, -18], [-1, -12], [6, -17]]){ dot(cx + px, y + py, HC.leafDk); dot(cx + px + 1, y + py, HC.leaf); }
    for (const [px, py] of [[-6, -19], [-3, -14], [3, -19], [5, -16], [0, -16]]){ dot(cx + px, y + py, '#f2b544'); dot(cx + px + 1, y + py + 1, '#ffd36b'); }
  } else if (i <= 19){                                       // 寒露、霜降：菊花
    for (const [ex, ey] of [[-5, -16], [4, -19], [0, -11]]){
      twig([[cx, y], [cx + ex, y + ey]], HC.leafDk);
      const fx = cx + ex, fy = y + ey;
      for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(fx + dx, fy + dy, ex > 0 ? '#f0a03c' : HC.gold);
      dot(fx, fy, HC.goldDk);
    }
    dot(cx - 3, y - 7, HC.leaf); dot(cx + 3, y - 9, HC.leaf); dot(cx - 2, y - 8, HC.leafLt);
  } else {                                                   // 立冬 – 大雪：红叶
    twig([[cx, y], [cx - 1, y - 12], [cx - 6, y - 21]], HC.wdk); twig([[cx - 1, y - 12], [cx + 6, y - 19]], HC.wdk);
    for (const [px, py, c] of [[-6, -22, HC.red], [-3, -17, '#e0703a'], [5, -20, HC.redLt], [2, -15, HC.red], [-7, -15, '#e0703a'], [7, -16, HC.red]]){
      dot(cx + px, y + py, c); dot(cx + px - 1, y + py + 1, c); dot(cx + px + 1, y + py + 1, c); dot(cx + px, y + py + 1, HC.lacD);
    }
  }
}
/* 门口置物板上的季节小物：春 = 一盆水仙，夏 = 团扇，秋 = 一盘柿子（柿柿如意），冬 = 铜手炉 */
function seasonItem(x, base, season){
  if (season === 0){
    rect(x - 4, base - 4, 9, 4, OUTL); rect(x - 3, base - 3, 7, 2, HC.blue); rect(x - 3, base - 3, 7, 1, HC.blueLt);
    for (const [dx, h] of [[-2, 7], [0, 9], [2, 6], [1, 8]]) rect(x + dx, base - 4 - h, 1, h, HC.leaf);
    for (const [dx, dy] of [[-3, -12], [2, -13]]){ rect(x + dx, base + dy, 3, 3, HC.white); dot(x + dx + 1, base + dy + 1, HC.gold); }
  } else if (season === 1){
    rect(x, base - 6, 1, 6, HC.wdk); rect(x - 2, base - 1, 5, 1, HC.wdk);
    disc(x, base - 12, 6, OUTL); disc(x, base - 12, 5, HC.white);
    rect(x - 3, base - 11, 4, 2, HC.pink); dot(x - 2, base - 12, HC.pinkLt); twig([[x - 1, base - 9], [x + 3, base - 14]], HC.leafDk);
  } else if (season === 2){
    rect(x - 7, base - 2, 15, 2, OUTL); rect(x - 6, base - 2, 13, 1, HC.celadon);
    for (const dx of [-3, 3]){ disc(x + dx, base - 6, 3, OUTL); disc(x + dx, base - 6, 2, '#f08a2e'); dot(x + dx - 1, base - 7, '#ffc070'); rect(x + dx - 1, base - 10, 3, 1, HC.leafDk); }
  } else {
    rect(x - 5, base - 3, 11, 3, OUTL); rect(x - 4, base - 3, 9, 2, HC.goldDk);
    disc(x, base - 6, 4, OUTL); disc(x, base - 6, 3, HC.gold); dot(x - 1, base - 8, HC.goldLt);
    for (const dx of [-2, 0, 2]) dot(x + dx, base - 6, HC.goldDk);
    rect(x - 4, base - 11, 9, 1, OUTL); dot(x, base - 12, HC.gold);
  }
}

/* ---------- 书架：两个书柜（一矮一高，顶面能站）、踏凳、星图手卷 ---------- */
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
  BOOKCASES.forEach(([x0, x1, top], i) => prop('bookcase_' + (i + 1), () => curioShelf(x0, x1, top, i * 3 + 1)));   // 两个书柜，格子里放着书、瓷瓶、盆景、书匣
  // 踏凳（能站：顶面 450）：先踩它，再一级一级跳上书柜
  prop('step_stool', () => {
    bevel(446, 450, 26, 4, HC.wl, HC.wh, HC.wd);
    for (const x of [448, 466]) boxO(x, 454, 4, 16, HC.wd);
    rect(450, 461, 18, 2, HC.wd);
  });
  // 书柜顶上：一个青花瓶、一摞书
  art(VASE, VASE_PAL, BOOKCASES[0][0] + 6, BOOKCASES[0][2] - 8);
  bookStack(BOOKCASES[1][1] - 24, BOOKCASES[1][2], 3, 4);
  // 星图手卷（挂在书柜上面的墙上）：星星连成线，盖一个红印
  prop('star_chart', starChart);
}
function starChart(){
  const x = 600, y = 92, w = 65, h = 45;
  rect(x - 3, y, 3, h, HC.wdk); rect(x + w, y, 3, h, HC.wdk);
  boxO(x, y, w, h, HC.paper); rect(x + 1, y + h - 2, w - 2, 1, HC.paperDk);
  const stars = [[8, 10], [16, 16], [26, 12], [34, 22], [44, 18], [52, 30], [20, 32], [30, 36]];
  for (let i = 0; i < 5; i++){ const [a, b] = stars[i], [c, d] = stars[i + 1]; for (let k = 0; k <= 10; k++) dot(x + a + Math.round((c - a) * k / 10), y + b + Math.round((d - b) * k / 10), HC.paperDk); }
  for (const [a, b] of stars) { dot(x + a, y + b, HC.ink); dot(x + a + 1, y + b, HC.ink); }
  disc(x + 48, y + 9, 4, HC.blueLt); disc(x + 49, y + 8, 2, HC.porc);
  rect(x + w - 9, y + h - 9, 5, 5, HC.red);
}

/* ---------- 窗户：月洞窗（窗台能站）、两边各一盏灯笼、番茄钟挂轴、茶桌、地毯、跟着节气换花的青花瓶 ---------- */
const LANTERNS = [[822, 334], [938, 334], [1360, 152]];   // 灯笼（顶端位置）：月洞窗两边各一盏、阁楼一盏
/* hook：挂在哪（默认从屋顶的梁上一根长绳吊下来；给了 y 就挂在墙上的一个小铜钩上） */
function lanternArt(cx, top, hook){
  const from = hook || A_CE + 9;
  if (hook){ rect(cx - 5, hook - 2, 11, 2, HC.wdk); dot(cx - 5, hook - 3, HC.gold); dot(cx + 5, hook - 3, HC.gold); }
  rect(cx, from, 1, top - from, OUTL);
  prop('lantern', () => lanternBody(cx, top), [cx - 8, top]);
}
function lanternBody(cx, top){
  rect(cx - 4, top, 9, 2, HC.goldDk); rect(cx - 4, top, 9, 1, HC.gold);
  for (let j = 0; j < 16; j++){
    const w = Math.round(7 * Math.sin((j + 0.5) / 16 * Math.PI)) + 1;
    rect(cx - w, top + 2 + j, w * 2 + 1, 1, OUTL);
    if (w > 1) rect(cx - w + 1, top + 2 + j, w * 2 - 1, 1, j < 5 ? HC.lanternLt : (j % 5 === 0 ? HC.lanternDk : HC.lantern));
  }
  rect(cx - 4, top + 18, 9, 2, HC.goldDk);
  rect(cx, top + 20, 1, 6, HC.red); dot(cx - 1, top + 26, HC.red); dot(cx + 1, top + 26, HC.red);
}
function drawWindowNook(tc){
  // 地毯（主题色 + 金边）
  rect(708, 467, 106, 3, OUTL); rect(709, 467, 104, 2, tc.rug); rect(709, 468, 104, 1, tc.rugDk);
  for (let x = 712; x < 812; x += 5) dot(x, 467, HC.gold);
  for (const x of [705, 814]) for (let y = 467; y < 470; y += 2) rect(x, y, 3, 1, HC.gold);
  for (const [cx, top] of LANTERNS.slice(0, 2)) lanternArt(cx, top, top - 12);   // 挂在月洞窗两边的墙钩上
  // 番茄钟挂轴（倒计时数字在 drawHouseLive 里画）
  prop('pomo_scroll', () => scroll(POMO_SCROLL[0], POMO_SCROLL[1], POMO_SCROLL[2], POMO_SCROLL[3]));
  // 茶桌 + 紫砂壶 + 两个杯子
  prop('tea_table', () => {
  bevel(712, 455, 53, 4, HC.wl, HC.wh, HC.wd);
  boxO(714, 459, 49, 3, HC.wd);
  for (const x of [717, 756]) boxO(x, 461, 4, 9, HC.wd);
  art(TEAPOT, TEAPOT_PAL, TEAPOT_AT[0], TEAPOT_AT[1]);
  boxO(719, 450, 5, 5, HC.celadon);
  boxO(750, 450, 5, 5, HC.porc);
  });
  // 青花大瓶，插的花跟着节气换
  prop('vase', () => { for (let j = 0; j < 22; j++){ const w = [3, 3, 4, 5, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 5, 5, 5, 5, 6, 6, 5, 4][j]; rect(787 - w - 1, 448 + j, w * 2 + 3, 1, OUTL); rect(787 - w, 448 + j, w * 2 + 1, 1, j % 7 === 3 ? HC.blue : HC.porc); } });
  seasonVase(787, 448);
}
const TEAPOT_AT = [731, 446];             // 紫砂壶（热气从壶嘴往上飘）
const POMO_SCROLL = [972, 344, 26, 58];    // 番茄钟挂轴（x, y, 宽, 高）

/* ---------- 电脑：任务板、电子钟、绣墩、翘头书案上的电脑（全息屏）、铜机柜、宫灯台灯；旁边两块板通往阁楼 ---------- */
const ECLOCK = [1164, 318, 29, 15];       // 电子钟（x, y, 宽, 高）：时、分是 drawHouseLive 按真实时间画的
const ECLOCK_DIGIT_X = [0, 4, 10, 14];    // 四个数字在屏上的位置（中间空出两点）
function drawStudy(){
  // 任务板：木框 + 钉着的小纸条（红印）
  prop('task_board', () => {
  bevel(1058, 340, 50, 38, HC.wm, HC.wl, HC.wd);
  rect(1061, 343, 44, 32, '#e6cfa6'); dither(1061, 343, 44, 32, '#d8bd8e');
  for (const [x, y] of [[1065, 347], [1080, 352], [1093, 346], [1070, 361]]){
    boxO(x, y, 11, 10, HC.paper); rect(x + 2, y + 4, 7, 1, HC.paperDk); rect(x + 2, y + 6, 5, 1, HC.paperDk); rect(x + 7, y + 6, 2, 2, HC.red);
  }
  });
  // 电子钟：铜框、深色的屏，屏上是没亮的「88:88」（像真的数码管），右下角一颗小灯
  prop('e_clock', () => {
    const [x, y, w, h] = ECLOCK, x0 = x + ((w - 17) >> 1);
    rect(x + 1, y + h, w, 1, 'rgba(60,40,30,0.25)');
    bevel(x, y, w, h, HC.goldDk, HC.gold, '#7a5222');
    rect(x + 2, y + 2, w - 4, h - 4, OUTL); rect(x + 3, y + 3, w - 6, h - 6, '#10261f');
    for (const dx of ECLOCK_DIGIT_X) DIGITS[8].forEach((r, j) => { for (let k = 0; k < 3; k++) if (r[k] === '#') dot(x0 + dx + k, y + 5 + j, '#1c3a31'); });
    dot(x + w - 3, y + h - 2, HC.jade);
  });
  // 绣墩（能站：顶面 452）
  prop('drum_stool', () => {
  rect(1073, 452, 27, 18, OUTL); rect(1074, 453, 25, 16, HC.lac); rect(1074, 453, 25, 2, HC.gold); rect(1074, 467, 25, 2, HC.gold);
  for (let x = 1077; x < 1097; x += 5) rect(x, 458, 2, 6, HC.lacD);
  });
  // 翘头书案（能站：顶面 435）+ 抽屉
  prop('desk', () => {
  bevel(1110, 435, 117, 5, HC.wl, HC.wh, HC.wd);
  rect(1108, 433, 4, 3, OUTL); rect(1225, 433, 4, 3, OUTL); dot(1109, 434, HC.wl); dot(1227, 434, HC.wl);
  boxO(1113, 440, 5, 30, HC.wd); boxO(1220, 440, 5, 30, HC.wd);
  bevel(1165, 440, 55, 13, HC.wm, HC.wl, HC.wd); rect(1188, 445, 9, 3, OUTL); rect(1189, 446, 7, 1, HC.gold);
  // 铜机柜（桌下）
  bevel(1122, 441, 14, 29, HC.goldDk, HC.gold, '#7a5222');
  for (let y = 452; y < 466; y += 3) rect(1125, y, 8, 1, '#7a5222');
  });
  // 电脑：全息屏（铜框，屏幕里的雨在 drawHouseLive 里画）+ 铜键盘、鼠标；玉石、青瓷杯；宫灯台灯
  prop('computer', () => {
  boxO(1127, 394, 37, 28, HC.goldDk); rect(1128, 395, 35, 1, HC.gold);
  rect(1130, 397, 31, 22, HC.jadeDk);
  rect(1130, 397, 31, 2, HC.jade); for (const dx of [26, 28]) dot(1130 + dx, 397, HC.jadeLt);   // 屏上一个窗口：标题栏
  for (const [dy, w] of [[3, 12], [5, 9], [7, 11]]) rect(1132, 397 + dy, w, 1, '#3f8c74');        // 几行字
  boxO(1159, 432, 4, 3, HC.porc); dot(1160, 432, HC.goldDk);                                      // 鼠标
  boxO(1143, 422, 5, 10, HC.goldDk); boxO(1137, 431, 17, 4, HC.goldDk);
  boxO(1167, 431, 22, 4, HC.gold); for (let x = 1169; x < 1187; x += 2) dot(x, 432, HC.goldDk);
  });
  prop('desk_things', () => {
  boxO(1192, 432, 5, 3, HC.jade);
  boxO(1201, 428, 6, 7, HC.celadon); rect(1207, 430, 2, 1, OUTL); rect(1208, 431, 1, 2, OUTL); rect(1207, 433, 2, 1, OUTL);
  });
  prop('desk_lamp', () => {
  boxO(1211, 431, 11, 4, HC.wdk); rect(1215, 420, 2, 11, OUTL);
  rect(1210, 410, 13, 11, OUTL); rect(1211, 411, 11, 9, HC.lanternLt); rect(1211, 414, 11, 1, HC.lantern); rect(1211, 418, 11, 1, HC.lantern);
  rect(1209, 409, 15, 2, HC.wdk);
  });
  for (const y of [392, 348]) wallShelf(1234, 1286, y, y === 392 ? 'books' : null);
  prop('armillary', () => armillary(1335, A_FL));
  prop('cabinet', () => drawerCabinet(1380, 1440, 420));
}
/* 浑天仪：铜座、立柱，一个正圆的铜环、一横一竖两个扁圆的环，中间一颗玉色小球，顶上一颗铜珠。x：中心，y：底 */
function armillary(x, y){
  bevel(x - 12, y - 6, 25, 6, HC.goldDk, HC.gold, '#7a5222');
  rect(x - 7, y - 9, 15, 3, '#7a5222'); rect(x - 6, y - 9, 13, 1, HC.goldDk);
  rect(x - 1, y - 30, 3, 21, '#7a5222'); rect(x, y - 30, 1, 21, HC.gold);
  const cx = x, cy = y - 46;
  ring(cx, cy, 15, '#7a5222'); ring(cx, cy, 14, HC.gold);
  for (let a = 0; a < TAU; a += 0.02) dot(cx + Math.round(Math.cos(a) * 14), cy + Math.round(Math.sin(a) * 5), HC.goldDk);
  for (let a = 0; a < TAU; a += 0.02) dot(cx + Math.round(Math.cos(a) * 5), cy + Math.round(Math.sin(a) * 14), HC.goldLt);
  disc(cx, cy, 4, HC.jadeDk); disc(cx, cy, 3, HC.jade); dot(cx - 1, cy - 1, HC.jadeLt);
  rect(cx - 1, cy - 18, 3, 3, HC.gold); dot(cx, cy - 18, HC.goldLt);
}
/* 抽屉柜：上面一块板（能站），四个带铜拉手的抽屉，两只脚；柜顶一个青瓷小瓶插着梅枝 */
function drawerCabinet(x0, x1, top){
  const w = x1 - x0;
  bevel(x0, top, w, 4, HC.wl, HC.wh, HC.wd);
  boxO(x0 + 2, top + 4, w - 4, A_FL - top - 12, HC.wm);
  const dw = (w - 12) >> 1;
  for (const [dx, dy] of [[5, 7], [7 + dw, 7], [5, 25], [7 + dw, 25]]){
    bevel(x0 + dx, top + dy, dw, 16, HC.wd, HC.wm, HC.wdk);
    rect(x0 + dx + (dw >> 1) - 2, top + dy + 7, 5, 2, HC.gold); dot(x0 + dx + (dw >> 1), top + dy + 7, HC.goldLt);
  }
  for (const lx of [x0 + 4, x1 - 8]) boxO(lx, A_FL - 8, 4, 8, HC.wd);
  boxO(x1 - 15, top - 9, 7, 9, HC.celadon); rect(x1 - 13, top - 8, 1, 6, '#c8e0d2');
  twig([[x1 - 12, top - 9], [x1 - 15, top - 18], [x1 - 20, top - 22]], HC.wdk); twig([[x1 - 14, top - 15], [x1 - 9, top - 21]], HC.wdk);
  for (const [px, py] of [[-20, -23], [-16, -19], [-9, -22], [-13, -14]]) bloom(x1 + px, top + py, HC.pink, HC.pinkLt, HC.pinkDk);
}

/* ---------- 右边：格子窗旁的宫灯、两个蒲团、大青花盆里的竹子 ---------- */
function drawRightEnd(){
  prop('palace_lantern', () => {
  boxO(1661, 466, 19, 4, HC.wdk);
  rect(1669, 420, 3, 46, OUTL); rect(1670, 420, 1, 46, HC.wm);
  rect(1659, 398, 23, 2, HC.wdk); rect(1661, 400, 19, 20, OUTL);
  rect(1662, 401, 17, 18, HC.lanternLt); rect(1662, 401, 1, 18, HC.lantern); rect(1678, 401, 1, 18, HC.lantern);
  rect(1669, 401, 1, 18, HC.wl); rect(1662, 409, 17, 1, HC.wl);
  rect(1659, 419, 23, 2, HC.wdk); for (const x of [1660, 1680]) { rect(x, 421, 1, 5, HC.red); }
  });
  prop('cushions', () => { for (const [x, w] of [[1490, 27], [1517, 24]]){
    rect(x + 2, 462, w - 4, 8, OUTL); rect(x, 464, w, 6, OUTL); rect(x + 1, 465, w - 2, 4, HC.straw); rect(x + 3, 463, w - 6, 2, HC.straw);
    for (let k = x + 3; k < x + w - 3; k += 3) dot(k, 466, HC.strawDk);
  } });
  // 大青花盆 + 竹子
  prop('bamboo_pot', () => {
  for (const [lx, h] of [[1742, 48], [1747, 58], [1752, 44], [1745, 36]]){
    for (let j = 0; j < h; j++){ dot(lx, 452 - j, j % 12 === 0 ? OUTL : HC.leafDk); dot(lx + 1, 452 - j, HC.leaf); }
    for (let k = 10; k < h; k += 9){ art(LEAF, LEAF_PAL, lx + 1, 452 - k - 3); art(LEAF.map(r => [...r].reverse().join('')), LEAF_PAL, lx - 5, 452 - k); }
  }
  for (let j = 0; j < 18; j++){ const w = 12 - Math.floor(j / 4); rect(1748 - w, 452 + j, w * 2 + 1, 1, OUTL); if (j && j < 17) rect(1749 - w, 452 + j, w * 2 - 1, 1, j % 6 === 3 ? HC.blue : HC.porc); }
  });
}

/* 衣柜：朱漆的两扇门、中间一对圆铜面叶和拉手，上面一道檐（能站），四只矮脚 */
function wardrobe(x, y, w, h){
  bevel(x - 2, y, w + 4, 5, HC.wm, HC.wl, HC.wd);
  boxO(x, y + 5, w, h - 9, HC.lac);
  const mid = x + (w >> 1);
  for (const dx of [3, (w >> 1) + 2]){ rect(x + dx, y + 8, (w >> 1) - 5, h - 16, HC.lacD); rect(x + dx + 1, y + 9, (w >> 1) - 7, h - 18, HC.lac); }
  rect(mid, y + 6, 1, h - 11, OUTL);
  for (const cy of [y + 30, y + 52]){ disc(mid - 4, cy, 3, HC.gold); disc(mid + 4, cy, 3, HC.gold); dot(mid - 4, cy, HC.goldDk); dot(mid + 4, cy, HC.goldDk); }
  rect(mid - 2, y + 40, 1, 6, HC.goldLt); rect(mid + 2, y + 40, 1, 6, HC.goldLt);
  for (const fx of [x + 2, x + w - 6]) boxO(fx, y + h - 4, 4, 4, HC.wdk);
}
/* ---------- 阁楼：木地板（能站）、朱漆栏杆、木床、樟木箱、灯笼、一摞线装书、小地毯 ---------- */
function drawMezzanine(tc){
  bevel(A_MX, A_MZ, A_WR - A_MX, 8, HC.wm, HC.wl, HC.wd);
  for (let x = A_MX + 20; x < A_WR; x += 40) rect(x, A_MZ + 2, 1, 4, HC.wd);
  for (let x = A_MX + 30; x < A_WR - 10; x += 60) art(['kmmmmk', 'kmmmk.', 'kmmk..', 'kmk...', 'kk....'], PW, x, A_MZ + 17);
  // 栏杆
  prop('railing', () => {
    bevel(A_MX, A_MZ - 23, 34, 3, HC.lac, HC.lacL, HC.lacD);
    for (let x = A_MX + 2; x < A_MX + 32; x += 7) boxO(x, A_MZ - 20, 3, 20, HC.lac);
    rect(A_MX + 1, A_MZ - 11, 32, 2, HC.gold);
  });
  // 木床（能站：顶面 260）
  prop('bed', () => {
  bevel(1572, 226, 9, 54, HC.lac, HC.lacL, HC.lacD); rect(1571, 224, 11, 3, HC.gold);
  bevel(1575, 266, 108, 7, HC.wm, HC.wl, HC.wd);
  for (const x of [1578, 1676]) boxO(x, 273, 5, 7, HC.wd);
  boxO(1579, 261, 103, 6, HC.white);
  boxO(1581, 255, 17, 7, HC.white); rect(1583, 260, 13, 1, HC.paperDk);
  rect(1598, 260, 85, 9, OUTL); rect(1599, 261, 83, 7, HC.pinkLt); rect(1599, 266, 83, 1, HC.pink);
  for (let x = 1608; x < 1680; x += 12) rect(x, 262, 1, 4, HC.pink);
  rect(1682, 261, 2, 12, OUTL); rect(1682, 261, 1, 11, HC.pinkLt);
  });
  // 樟木箱（能站：顶面 260 / 240）
  prop('chests', () => {
  bevel(1084, 260, 31, 20, HC.wm, HC.wl, HC.wd); rect(1085, 266, 29, 1, HC.wd);
  for (const [x, y] of [[1085, 261], [1111, 261], [1085, 276], [1111, 276]]) rect(x, y, 3, 3, HC.gold);
  rect(1097, 264, 5, 4, HC.gold);
  bevel(1114, 240, 27, 40, HC.lac, HC.lacL, HC.lacD); rect(1115, 247, 25, 1, HC.lacD);
  for (const [x, y] of [[1115, 241], [1137, 241], [1115, 276], [1137, 276]]) rect(x, y, 3, 3, HC.gold);
  rect(1125, 252, 5, 5, HC.gold); dot(1127, 254, HC.goldDk);
  });
  // 衣柜（能站：顶面 200）
  prop('wardrobe', () => wardrobe(1424, 200, 52, 80));
  lanternArt(...LANTERNS[2]);
  prop('loft_window', () => latticeWindow(...LOFT_WIN), null, () => PG.clearRect(...LOFT_WIN));   // 床上方的格子窗
  // 小地毯 + 一摞线装书
  rect(1150, 278, 104, 2, OUTL); rect(1151, 278, 102, 1, tc.rug); for (let x = 1154; x < 1252; x += 5) dot(x, 278, HC.gold);
  bookStack(1230, 280, 4, 2);
}

/* ============================================================
   窗外远景：星海 + 穹顶里的庭院（一张宽图，跟着镜头只移动一半）
   从窗户里看出去：上面是星空和行星，下面是庭院的白墙黛瓦和竹子
   ============================================================ */
const FAR_W = 1200, FAR_H = 520;   // 比窗户里一般看到的高：镜头升到屋顶附近时，低处的月洞窗里是庭院的地面，不是空白
/* 三种天色：夜里（星海、亮着灯）、傍晚（晚霞，几颗星，亮着灯）、白天（穹顶里的人造天光：浅蓝天，白墙，灯不亮） */
const FAR_PAL = {
  night: {
    sky: ['#0f1433', '#141a3e', '#1a2048', '#212658', '#292d63', '#33336c', '#3f3a76'], nebula: 1, stars: 1, starTop: 200, planet: 1,
    moon: ['#d8d6e6', '#efedf6', '#b9b6cc'], isle: ['#3a3466', '#2a2550', '#1d1a33'], lit: true, dome: 'rgba(160,180,255,0.10)',
    roof: ['#3b3a5c', '#4c4b72', '#6a6994', '#1d1a33'], wall: ['#7d7898', '#686382'], bamboo: ['#2f5a46', '#4c7f5e', '#1d3a2c'], ground: '#2b2a44',
  },
  dusk: {
    sky: ['#2b2552', '#45306a', '#6e3a72', '#a24c70', '#d0666a', '#ec8c62', '#f5b26c'], nebula: 0.5, stars: 0.35, starTop: 70, planet: 1,
    moon: ['#f0d6c8', '#fbeee6', '#d4b3a6'], isle: ['#3a2547', '#2c1d3a', '#20142c'], lit: true, dome: 'rgba(255,200,180,0.10)',
    roof: ['#4a3550', '#5e4566', '#7e6086', '#251a2e'], wall: ['#c9a092', '#b0857e'], bamboo: ['#33493a', '#4f6a52', '#1f2e26'], ground: '#3a2a3c',
  },
  day: {
    sky: ['#4f7cc4', '#5d89cc', '#6c96d3', '#7ca3da', '#8eb2e1', '#a3c2e8', '#bad3ee'], nebula: 0, stars: 0, starTop: 0, planet: 0.45,
    moon: ['#e8eef8', '#f6f9fd', '#cfd9ea'], isle: ['#8796bd', '#7787b0', '#66769e'], lit: false, dome: 'rgba(255,255,255,0.22)',
    roof: ['#55617e', '#6b7898', '#8e9ab6', '#3c4560'], wall: ['#ece7dd', '#d9d2c5'], bamboo: ['#3f7a50', '#62a06c', '#2b5a3a'], ground: '#9a9a96',
  },
};
function paintFar(P){
  const c = pxCanvas(FAR_W, FAR_H), keep = PG;
  PG = c.getContext('2d');
  const sky = P.sky;
  sky.forEach((col, i) => { rect(0, i * 30, FAR_W, 30, col); if (i) dither(0, i * 30 - 2, FAR_W, 4, sky[i - 1], i); });
  rect(0, sky.length * 30, FAR_W, FAR_H, sky[sky.length - 1]);
  // 星云
  if (P.nebula) for (const [cx, cy, r, col] of [[430, 140, 46, '120,80,150'], [820, 90, 40, '70,120,140'], [980, 150, 50, '120,80,150'], [160, 120, 44, '70,120,140']]){
    for (let k = r; k > 0; k -= 7) disc(cx, cy, k, `rgba(${col},${(0.09 * P.nebula).toFixed(3)})`);
  }
  // 星星
  for (let i = 0; i < 520; i++){
    const x = Math.floor(hash(i * 2.1) * FAR_W), y = Math.floor(hash(i * 5.3) * 200), b = hash(i * 9.7);
    if (y >= P.starTop || hash(i * 4.9) > P.stars) continue;
    dot(x, y, b > 0.75 ? '#fff6d8' : (b > 0.4 ? '#cfd8f5' : '#7d84b5'));
  }
  // 带环的行星（月洞窗里看得到）；白天被天光冲淡
  planet(452, 160, 22);
  if (P.planet < 1){ PG.globalAlpha = 1 - P.planet; rect(408, 130, 90, 50, sky[5]); PG.globalAlpha = 1; }
  // 阁楼圆窗里的小月亮
  disc(800, 108, 7, P.moon[0]); disc(802, 106, 5, P.moon[1]); dot(798, 110, P.moon[2]);
  disc(560, 120, 3, '#e6c79a');
  // 漂浮的小岛 + 楼阁（人造小行星上的住处）
  for (const [cx, cy, w] of [[380, 186, 16], [520, 194, 11], [690, 182, 13], [880, 190, 15], [1010, 184, 12], [240, 190, 12]]) isle(cx, cy, w, P);
  // 穹顶的骨架线（淡淡的）
  for (let x = 0; x < FAR_W; x++){
    const y1 = Math.round(60 + 40 * Math.cos(x / FAR_W * TAU * 2));
    PG.fillStyle = P.dome; PG.fillRect(x, y1, 1, 1);
  }
  // 庭院：黛瓦 + 白墙 + 小灯 + 竹子
  rect(0, 206, FAR_W, 6, P.roof[0]);
  for (let x = 0; x < FAR_W; x += 4){ rect(x, 206, 3, 6, P.roof[1]); dot(x, 206, P.roof[2]); }
  rect(0, 211, FAR_W, 1, P.roof[3]);
  rect(0, 212, FAR_W, FAR_H - 212, P.wall[0]); rect(0, 236, FAR_W, FAR_H - 236, P.wall[1]);
  for (let x = 30; x < FAR_W; x += 110){
    if (P.lit) disc(x, 222, 6, 'rgba(255,176,112,0.18)');
    rect(x - 1, 219, 3, 5, P.lit ? '#ff7a45' : '#9a3b2c'); dot(x, 218, '#2a1a14');
  }
  for (let i = 0; i < 46; i++){
    const bx = Math.floor(hash(i * 4.4) * FAR_W), h = 40 + Math.floor(hash(i * 6.1) * 50), lean = (hash(i * 8.2) - 0.5) * 0.1;
    for (let j = 0; j < h; j++){
      const x = Math.round(bx + lean * j), y = 250 - j;
      dot(x, y, P.bamboo[0]); dot(x + 1, y, P.bamboo[1]); if (j % 14 === 0){ dot(x, y, P.bamboo[2]); dot(x + 1, y, P.bamboo[2]); }
      if (j > h - 28 && j % 7 === 0) for (let t = 0; t < 5; t++){ dot(x + 2 + t, y - (t >> 1), P.bamboo[0]); dot(x - 1 - t, y - (t >> 1) + 1, P.bamboo[1]); }
    }
  }
  rect(0, 250, FAR_W, FAR_H - 250, P.ground);
  PG = keep;
  return c;
}
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
function isle(cx, cy, w, P){
  for (let k = 0; k < 7; k++) rect(cx - w + k * 2, cy + k, (w - k * 2) * 2, 1, k ? P.isle[1] : P.isle[0]);
  rect(cx - 6, cy - 8, 12, 8, P.isle[2]);
  rect(cx - 9, cy - 10, 18, 2, P.isle[2]); dot(cx - 10, cy - 11, P.isle[2]); dot(cx + 9, cy - 11, P.isle[2]);
  rect(cx - 4, cy - 14, 8, 4, P.isle[2]); rect(cx - 6, cy - 15, 12, 1, P.isle[2]);
  if (P.lit){ dot(cx - 2, cy - 5, '#ffbb67'); dot(cx - 2, cy - 4, '#ffbb67'); dot(cx + 2, cy - 5, '#ffbb67'); }
}
const FAR = { night: paintFar(FAR_PAL.night), dusk: paintFar(FAR_PAL.dusk), day: paintFar(FAR_PAL.day) };
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
const GLOW_S = makeGlow(16, 'rgba(255,190,120,0.30)'), GLOW_L = makeGlow(30, 'rgba(255,170,100,0.24)'), GLOW_XL = makeGlow(44, 'rgba(255,150,80,0.14)');

/* ============================================================
   每帧：远景 + 房子（换主题时一格一格溶解过去）+ 会动的小东西
   g 是低分辨率画布；ix / iy 是镜头左上角（整数像素）
   ============================================================ */
let mixCv = null;
function drawHouseLayer(g, ix, iy, w, h){
  if (!houseCv || houseTheme !== themeIdx || houseTerm !== currentTerm().i) buildHouse();   // 换主题、换节气时重画
  if (houseOld && washT < 1){
    g.drawImage(houseOld, ix, iy, w, h, 0, 0, w, h);
    if (!mixCv || mixCv.width !== w || mixCv.height !== h) mixCv = pxCanvas(w, h);
    const m = mixCv.getContext('2d');
    m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, w, h);
    m.drawImage(houseCv, ix, iy, w, h, 0, 0, w, h);
    m.globalCompositeOperation = 'destination-in';
    m.fillStyle = bayerPat(Math.min(16, Math.floor(easeW(washT) * 17)));
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
let farMix = null;
function drawFar(g, t, ix, iy, w, h){
  // 镜头里一个窗户都没有：远景和雨丝都会被房子整个挡住，干脆不画
  if (!WINDOWS.some(([x, y, ww, wh]) => x < ix + w && x + ww > ix && y < iy + h && y + wh > iy)) return;
  const fx = Math.floor(ix * FAR_PAR), fy = Math.floor(iy * FAR_PAR * 0.6);
  // 天色：两张之间按比例一格一格溶（和换主题一样的抖动溶解）
  const m = skyMix(), ls = [['night', m.night], ['dusk', m.dusk], ['day', m.day]].filter(l => l[1] > 0.001).sort((a, b) => b[1] - a[1]);
  g.drawImage(FAR[ls[0][0]], fx, fy, w, h, 0, 0, w, h);
  if (ls[1]){
    if (!farMix || farMix.width !== w || farMix.height !== h) farMix = pxCanvas(w, h);
    const fm = farMix.getContext('2d');
    fm.globalCompositeOperation = 'source-over'; fm.clearRect(0, 0, w, h);
    fm.drawImage(FAR[ls[1][0]], fx, fy, w, h, 0, 0, w, h);
    fm.globalCompositeOperation = 'destination-in';
    fm.fillStyle = bayerPat(Math.round(ls[1][1] * 16));
    fm.fillRect(0, 0, w, h);
    fm.globalCompositeOperation = 'source-over';
    g.drawImage(farMix, 0, 0);
  }
  PG = g;
  if (m.night + m.dusk * 0.4 > 0.5) TWINKLE.forEach(([sx, sy], k) => {
    const b = (t * 1.5 + k * 0.37) % 1, x = sx - fx, y = sy - fy;
    if (b < 0.5){ dot(x, y, '#fff6d8'); if (b > 0.15 && b < 0.35) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + dx, y + dy, 'rgba(255,246,216,0.5)'); }
  });
  // 镖船：挂着小红旗，慢慢飞过（白天是浅一点的剪影，灯不亮）
  const sx = ((t * 6) % 1400) - 100 - fx, sy = 168 - fy, hull = m.day > 0.5 ? '#56628a' : '#1d1a33';
  rect(sx, sy, 14, 3, hull); rect(sx + 2, sy - 2, 8, 2, hull); rect(sx + 4, sy - 6, 1, 4, hull);
  rect(sx + 5, sy - 6, 4, 2, '#c0392b');
  if (m.day <= 0.5){ dot(sx + 13, sy + 1, '#ffbb67'); dot(sx, sy + 1, '#ff7a45'); }
  g.fillStyle = m.day > 0.5 ? 'rgba(84,104,150,0.45)' : m.dusk > 0.5 ? 'rgba(255,222,206,0.5)' : 'rgba(200,214,250,0.55)';
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
  // 门口的控制面板：屏幕上一个小齿轮在发光，指示灯一闪一闪
  const R = typeof Room !== 'undefined' ? Room : null;
  {
    const [cx, cy, cw] = CTRL, x = X(cx), y = Y(cy), hot = R && (R.hover === 'panel' || R.near === 'panel');
    if (x > -30 && x < 470 && y > -30 && y < 270){
      const gear = ['.#.#.', '#####', '##.##', '#####', '.#.#.'];
      gear.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '#') dot(x + 5 + i, y + 4 + j, hot ? '#e8fff6' : HC.jadeLt); });
      if (hot) rect(x + 3, y + 3, cw - 6, 7, 'rgba(166,227,200,0.25)');
      dot(x + cw - 3, y + 14, (t % 1.6) < 1.2 ? '#8fe07e' : '#3f6a3a');
    }
  }
  // 日历：上面红条里是几月，中间大大的几号，下面一排小格子是星期（今天那格是红的，周一在最左）
  {
    const [cx, cy, cw] = CAL, x = X(cx), y = Y(cy);
    if (x > -30 && x < 470 && y > -30 && y < 270){
      const now = new Date(), mo = String(now.getMonth() + 1), dd = String(now.getDate()), wd = (now.getDay() + 6) % 7;
      const digits = (txt, x0, y0, sc, col) => [...txt].forEach((ch, i) => DIGITS[ch].forEach((r, j) => {
        for (let k = 0; k < 3; k++) if (r[k] === '#') rect(x0 + i * (3 * sc + 1) + k * sc, y0 + j * sc, sc, sc, col);
      }));
      digits(mo, x + Math.round((cw - (mo.length * 4 - 1)) / 2), y + 2, 1, HC.white);
      digits(dd, x + Math.round((cw - (dd.length * 7 - 1)) / 2), y + 10, 2, HC.ink);
      for (let k = 0; k < 7; k++) rect(x + 2 + k * 3, y + 22, 2, 2, k === wd ? HC.red : (k >= 5 ? HC.paperDk : '#d9cdb8'));
    }
  }
  // 音箱：放着声音的时候低音一鼓一鼓、指示灯亮、往右边飘出小音符（左边是墙角）
  {
    const [sx, sy, sw, sh] = SPEAKER, x = X(sx), y = Y(sy);
    if (x > -40 && x < 480 && y > -60 && y < 280 && typeof Ambience !== 'undefined' && Ambience.playing()){
      const [cx, cy] = SPK_CONE(x, y, sw, sh);
      if ((t * 3.2) % 1 < 0.45){ ring(cx, cy, 6, '#4a3c36'); disc(cx, cy, 2, '#6a5a52'); }
      dot(x + sw - 4, y + sh - 4, '#8fe07e');
      for (let k = 0; k < 3; k++){
        const ph = (t * 0.5 + k / 3) % 1, nx = Math.round(x + sw + 2 + ph * 20), ny = Math.round(y + 8 + k * 6 - ph * 10 + Math.sin(ph * 7 + k) * 2);
        if (ph > 0.85) continue;
        const col = k % 2 ? HC.lac : HC.blue;
        rect(nx + 2, ny, 1, 4, col); rect(nx + 2, ny, 2, 1, col); rect(nx, ny + 3, 2, 2, col); dot(nx + 3, ny + 1, col);
      }
    }
  }
  // 指着 / 站在旁边的东西：一圈亮金边；站在旁边时头顶冒一个 E 键
  for (const [kind, box] of THINGS){
    const hot = R && (R.hover === kind || R.near === kind);
    if (!hot) continue;
    const [bx, by, bw, bh] = box, x = X(bx), y = Y(by);
    rect(x - 1, y - 1, bw + 2, 1, HC.goldLt); rect(x - 1, y + bh, bw + 2, 1, HC.goldLt); rect(x - 1, y, 1, bh, HC.goldLt); rect(x + bw, y, 1, bh, HC.goldLt);
    if (R.near === kind){
      const high = by < A_CE + 20;   // 贴着屋顶（左上角的音箱）：E 键冒在右边
      const ky = (high ? y + (bh >> 1) - 4 : y - 13) + Math.round(Math.sin(t * 4)), kx = high ? x + bw + 4 : x + (bw >> 1) - 4;
      rect(kx + 1, ky, 7, 9, OUTL); rect(kx, ky + 1, 9, 7, OUTL); rect(kx + 1, ky + 1, 7, 7, HC.white); rect(kx + 1, ky + 7, 7, 1, HC.paperDk);
      rect(kx + 3, ky + 2, 1, 5, OUTL); rect(kx + 3, ky + 2, 3, 1, OUTL); rect(kx + 3, ky + 4, 2, 1, OUTL); rect(kx + 3, ky + 6, 3, 1, OUTL);
    }
  }
  // 全息屏里在下雨 + 闪烁的光标
  const sx = X(1130), sy = Y(397);
  for (let i = 0; i < 10; i++){
    const rx = sx + 1 + ((i * 13) % 29), ry = sy + Math.floor((t * 24 + i * 11) % 26) - 3;
    if (ry >= sy + 9 && ry + 2 < sy + 22) rect(rx, ry, 1, 2, HC.jadeLt);
  }
  if ((t % 1) < 0.5) rect(sx + 3, sy + 17, 3, 1, HC.jadeLt);
  // 电子钟：真实的时、分，中间两点一秒闪一下
  {
    const [ex, ey, ew] = ECLOCK, x = X(ex), y = Y(ey);
    if (x > -40 && x < 480 && y > -30 && y < 280){
      const now = new Date(), txt = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0'), x0 = x + ((ew - 17) >> 1);
      [...txt].forEach((ch, i) => DIGITS[ch].forEach((r, j) => { for (let k = 0; k < 3; k++) if (r[k] === '#') dot(x0 + ECLOCK_DIGIT_X[i] + k, y + 5 + j, HC.jadeLt); }));
      if (now.getMilliseconds() < 500){ dot(x0 + 8, y + 6, HC.jadeLt); dot(x0 + 8, y + 8, HC.jadeLt); }
    }
  }
  // 铜机柜的小玉灯
  dot(X(1128), Y(446), (t % 2.4) < 2 ? HC.jadeLt : HC.jadeDk);
  // 茶的热气：一缕一缕往上飘
  for (let k = 0; k < 2; k++){
    const ph = (t * 0.45 + k * 0.5) % 1;
    if (ph < 0.8) dot(X(TEAPOT_AT[0] + 6) + Math.round(Math.sin(ph * 9 + k) * 1.5), Y(TEAPOT_AT[1] - 3) - Math.floor(ph * 14), `rgba(255,255,255,${(0.8 - ph) * 0.9})`);
  }
}

/* ============================================================
   天光（最后叠在整个画面上，人物也在里面）：夜里正片叠底一层月光蓝、傍晚一层晚霞橘；
   灯笼、宫灯、台灯在傍晚开始亮，夜里最亮（叠加的暖光，轻轻闪）；白天不亮
   c2 已经按像素缩放好，原点是镜头左上角；camX / camY 是镜头位置（像素）
   ============================================================ */
const LAMPS = [...LANTERNS.map(([x, y]) => [x, y + 11, 'L']), [1216, 415, 'S'], [1670, 410, 'L']];   // 灯笼、书案上的台灯、格子窗旁的宫灯
function drawLights(c2, t, camX, camY, q, VW, VH){
  const m = skyMix(), lit = Math.min(1, m.night + m.dusk * 0.6);
  // 正片叠底：颜色还在，只是整体变暗、偏月光的蓝 / 晚霞的橘
  c2.globalCompositeOperation = 'multiply';
  if (m.night > 0.001){ c2.fillStyle = `rgba(112,122,196,${m.night.toFixed(3)})`; c2.fillRect(0, 0, VW, VH); }
  if (m.dusk > 0.001){ c2.fillStyle = `rgba(255,196,160,${m.dusk.toFixed(3)})`; c2.fillRect(0, 0, VW, VH); }
  c2.globalCompositeOperation = 'source-over';
  if (lit < 0.01) return;
  c2.globalCompositeOperation = 'lighter';
  LAMPS.forEach(([lx, ly, size], k) => {
    const x = q(lx - camX), y = q(ly - camY);
    if (x < -50 || x > VW + 50 || y < -50 || y > VH + 50) return;
    const flick = 0.85 + Math.sin(t * 2.1 + k * 1.7) * 0.1 + Math.sin(t * 7.3 + k) * 0.05;
    c2.globalAlpha = lit * flick;
    if (size === 'L'){ c2.drawImage(GLOW_XL, x - 44, y - 44); c2.drawImage(GLOW_L, x - 30, y - 30); }
    c2.drawImage(GLOW_S, x - 16, y - 16);
  });
  c2.globalAlpha = 1;
  c2.globalCompositeOperation = 'source-over';
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
const FG_IVY = [[300, A_CE + 9, 5], [560, A_CE + 9, 6], [960, A_CE + 9, 7], [1700, A_MZ + 17, 5]].map(([x, y, n], i) => ({ x, y, c: makeIvy(n, i * 2.3) }));
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
  for (const ax of [422, 1042]){
    const [x] = at(ax, 0);
    if (x < -30 || x > VW + 30) continue;
    c2.drawImage(FG_PILLAR, x - 9, -20);
  }
  for (const ax of [380, 1010, 1610]){
    const [x, y] = at(ax, A_FL);
    if (x < -40 || x > VW + 40) continue;
    c2.drawImage(FG_POT, x - 20, y - 54);
  }
}
