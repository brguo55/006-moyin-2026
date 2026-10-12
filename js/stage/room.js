"use strict";
/* ============================================================
   room.js：横版 2D 地图（空洞骑士那种纯侧面）—— 一栋两层的小屋，镜头锁定 rabbit
   ------------------------------------------------------------
   rabbit 坐在一把悬浮的金椅子上（像诸葛亮的四轮车，但是飘着），椅子带着他飘来飘去：
   A / D 左右飘；空格跳（按得越久跳得越高），空中再按一次 = 二段跳；站在家具上按 S 下来；
   E 互动（目前只有门口的控制面板：打开设置）；W 先空着（以后进门 / 上楼梯）
   打瞌睡的时候这些键都不管用，要点他一下才醒
   动画（sprites.js 的 RABBIT）：平时 idle_rabbit；番茄钟专注时 focus_rabbit_one（喝茶）
   rabbit 左右两边长得不一样（一边衣服、一边机械），不能镜像，所以暂时一直朝右
   家具的顶面都是「单向平台」：从下面能穿上去，从上面落下能站住（阁楼的木地板也是）
   镜头：平滑跟随 rabbit、朝他飘的方向多看一点、到地图边缘停住
   视差：窗外的景色移动得慢（远），前景的柱子 / 植物移动得快（近）→ 2.5D 的深度
   像素风：房子画在低分辨率画布上（1 像素 = 2 世界单位，house.js），整数倍放大；
          人物和前景直接画在屏幕上，位置对齐到屏幕像素 → 镜头移动时也是平滑的
   ------------------------------------------------------------
   地图（世界坐标）3600 × 1000，约 4 屏宽、2 屏高；地板 y = 940，阁楼地板 y = 560
   像素坐标就是世界坐标 ÷ 2：1800 × 500，镜头 448 × 252
   一楼从左到右：门厅 → 书房（两个高博古架，挑高到屋顶）→ 茶室（月洞窗、番茄钟挂轴、茶桌）→ 工作间（书案、全息屏）→ 格子窗
   二楼阁楼（x 2100–3560）：床、圆窗、樟木箱；从茶室旁边的一排置物板跳上去
   ============================================================ */

const MAP_W = 3600, MAP_H = 1000, FLOOR_Y = 940, MEZZ_Y = 560, MEZZ_X0 = 2100;
const WALL_L = 40, WALL_R = 3560, CEIL_Y = 20;
const VIEW_W = 896, VIEW_H = 504;      // 镜头看到的范围（世界单位，16:9）
const KH = 120, KHW = 30;              // rabbit 连椅子的高 / 半宽（碰撞用；像素图约 38 × 55 像素，再浮空几像素）
/* 手感：参照空洞骑士 —— 起步快、空中可以转向、下落比上升快、松开空格就不再往上 */
const RUN = 170, GRAV = 1500, FALL_MUL = 1.35, JUMP_V = 562, CUT_V = 210, MAX_FALL = 720;
const AIR_JUMP_V = 520, AIR_JUMPS = 1;  // 二段跳：比第一跳略低；落地后恢复次数
const APEX_V = 90, APEX_GRAV = 0.55;   // 按住空格时，快到最高点那一下重力变小 → 有一点悬空感、好控制
const AIR_CONTROL = 15;                // 空中转向的灵敏度（地面是 22）
const COYOTE = 0.09, BUFFER = 0.12;    // 走出边缘后还能起跳的时间 / 提前按跳的缓冲
const FG_PAR = 0.3, FAR_PAR = 0.5;     // 前景比中景多移动 30%；窗外景色只移动一半
const NAP_AFTER = 30;                  // 多少秒没操控 rabbit，他就打瞌睡（正式版可以调长）；按真实时间算，切到别的窗口也照样计时

/* ---------- 能站的面（单向平台）[x0, x1, y] ---------- */
const PLATS = [];
const plat = (name, x0, x1, y) => { const p = { name, x0, x1, y }; PLATS.push(p); return p; };
plat('阁楼', MEZZ_X0, WALL_R, MEZZ_Y);
plat('鞋凳', 330, 430, 912);
plat('书架', 636, 764, 700);
plat('书架', 976, 1104, 650);
plat('小凳', 860, 910, 900);
for (const [x0, x1, y] of [[790, 860, 820], [870, 950, 740], [1120, 1200, 570], [1220, 1300, 480], [1300, 1380, 400]]) plat('置物板', x0, x1, y);
plat('窗台', 1508, 1732, 840);
plat('茶几', 1920, 2020, 910);
for (const [x0, x1, y] of [[2120, 2200, 860], [2230, 2310, 780], [2120, 2200, 700], [2230, 2310, 620]]) plat('置物板', x0, x1, y);
plat('转椅', 2400, 2452, 904);
plat('书桌', 2476, 2704, 870);
plat('矮书柜', 2756, 2864, 860);
plat('窗台', 3040, 3260, 860);
plat('纸箱', 2400, 2460, 520);
plat('纸箱', 2460, 2512, 480);
plat('床', 3150, 3360, 520);

const Room = {
  t: 0,
  x: 1860, y: FLOOR_Y, vx: 0, vy: 0,  // 一开始飘在茶室的地毯上
  facing: 1,
  grounded: true, ground: null,     // 站在哪：null = 地板，否则是平台
  coyote: 0, jumpBuf: 0, jumpHeld: false, airJumps: AIR_JUMPS,
  groundY: FLOOR_Y,                 // 最近一次站稳的高度（镜头按它定高，小跳时不上下晃）
  drop: null, dropUntil: 0,
  keys: new Set(),
  napT: -1, lastInput: Date.now(),  // 打瞌睡：睡了多久（-1 = 醒着）；最后一次操控的时间（真实时间，毫秒）
  napHinted: false,                 // 这次睡着以后，是不是已经提示过「点他叫醒」
  dim: 0,                           // 打瞌睡时场景暗下来多少（0 – 1，main.js 画）
  wasBreak: false,                  // 上一帧番茄钟是不是在休息（休息刚开始 → 伸懒腰）
  stretchDue: false, breakNap: false,   // 休息开始了、懒腰还没伸；长休息开头要打的那个盹（被操控过就不打了）
  focusA: 'focus_one', focusT: 0, focusLoops: 0,   // 专注时轮流播喝茶 / 吃苹果
  cam: { x: 0, y: 0 }, lookAhead: 0, camReady: false, settled: false,
  bunny: { x: 1800, y: 860, facing: 1, jump: -1 },
  hearts: [], puffs: [],
  act: null,                        // 正在播的一次性动作：{ kind: 'takeoff' | 'boost' | 'land', t }
  hover: null, nearPanel: false,    // 鼠标指着什么；rabbit 是不是在门口的控制面板旁边
  s: 1, k: 2, kd: 2, ox: 0, oy: 0,

  /* ---------- 布局：镜头画面居中在舞台可用区域，最大 1 倍；
     一个像素放大成整数个屏幕像素（kd），像素才是方方正正、一样大的 ---------- */
  layout(){
    const aw = Math.max(240, W - insetR);
    const s = Math.max(0.3, Math.min(1, aw * 0.9 / VIEW_W, (H - 200) / VIEW_H));
    this.kd = Math.max(1, Math.floor(s * PX * DPR + 1e-6));
    this.k = this.kd / DPR;            // 一个像素在屏幕上多宽（CSS 像素）
    this.s = this.k / PX;              // 世界单位 → CSS 像素
    const snap = v => Math.round(v * DPR) / DPR;
    this.ox = snap(CX - VIEW_W / 2 * this.s);
    this.oy = snap(Math.max(80, (H - 110 - VIEW_H * this.s) / 2 + 20));
  },
  toWorld(px, py){ return [(px - this.ox) / this.s + this.cam.x, (py - this.oy) / this.s + this.cam.y]; },

  /* ---------- 输入 ---------- */
  keyDown(code){
    if (!['KeyA', 'KeyD', 'Space', 'KeyS', 'KeyE', 'KeyW'].includes(code)) return false;
    if (this.dozing()){ this._napHint(); return true; }   // 打瞌睡：按键都不管用，要点他一下才醒
    this._touched();
    if (code === 'KeyA' || code === 'KeyD') this.keys.add(code);
    else if (code === 'Space'){ if (!this.jumpHeld){ this.jumpBuf = BUFFER; } this.jumpHeld = true; }
    else if (code === 'KeyS') this.dropDown();
    else if (code === 'KeyE') this.interact();
    return true;   // W 先空着：以后进门 / 上楼梯
  },
  keyUp(code){ this.keys.delete(code); if (code === 'Space') this.jumpHeld = false; },
  clearKeys(){ this.keys.clear(); this.jumpHeld = false; },
  /* 在打瞌睡，或者刚被点醒、还在醒神（wake 播完才能动） */
  dozing(){ return this.napT >= 0 || !!(this.act && this.act.kind === 'wake'); },
  /* 睡着时按了键：提示一下要点他（每次睡着只提示一次） */
  _napHint(){
    if (this.napT < 0 || this.napHinted) return;
    this.napHinted = true;
    if (typeof toast === 'function') toast('rabbit 在打瞌睡，点他一下叫醒');
  },
  /* 操控了 / 点醒了 rabbit：记下时间、醒过来；长休息开头的那个盹也不用打了 */
  _touched(){ this.lastInput = Date.now(); this.napT = -1; this.breakNap = false; },
  /* E：互动 —— 看 rabbit 面前是什么。现在只有门口的控制面板：打开设置 */
  interact(){ if (this.nearPanel) this._openSettings(); },
  _openSettings(){ beep(); if (typeof openSettings === 'function') openSettings(); },
  /* S：从平台上跳下来（地板上按没反应） */
  dropDown(){
    if (!this.grounded || !this.ground) return;
    this.drop = this.ground; this.dropUntil = this.t + 0.3;
    this.grounded = false; this.ground = null; this.y += 2; this.vy = 80;
  },

  hit(px, py){
    const [x, y] = this.toWorld(px, py);
    const b = this.bunny, [cx, cy, cw, ch] = CTRL;
    if (x > cx * PX - 4 && x < (cx + cw) * PX + 4 && y > cy * PX - 4 && y < (cy + ch) * PX + 4) return 'panel';
    if (Math.hypot(x - b.x, y - b.y) < 18) return 'bunny';
    if (Math.abs(x - this.x) < 40 && y < this.y + 4 && y > this.y - KH) return 'rabbit';
    return null;
  },
  click(px, py){
    const who = this.hit(px, py);
    if (who === 'panel') this._openSettings();
    else if (who === 'rabbit'){
      if (this.napT >= 0){ this._touched(); this._play('wake'); }   // 睡着时被点：醒过来
      else this.doCheer();                                           // 平时被点：冒红色爱心
    }
    else if (who === 'bunny'){ this.bunny.jump = 0; this._burst(this.bunny.x, this.bunny.y - 14, 2); chirp(); }
    return !!who;
  },
  /* 画面「安静」：没在操作、rabbit 停着、镜头和小鸟都到位、没有粒子 → 主循环可以降帧省电 */
  quiet(){
    return !this.keys.size && this.jumpBuf <= 0 && this.grounded && Math.abs(this.vx) < 1
      && !this.hearts.length && !this.puffs.length && !this.act && this.settled;
  },
  /* 被点了一下：叮一声，冒红色爱心 */
  doCheer(){
    clink();
    this._burst(this.x + 6, this.y - 128, 5);
  },
  /* 完成一件事（番茄钟、任务打勾、习惯打卡）：拍手庆祝 + 爱心；睡着的话也会醒 */
  celebrate(){
    this._touched();
    if (this.grounded) this._play('done');
    this.doCheer();
  },
  /* 播一段一次性的动作；只有朝右的动画，播之前先转成朝右 */
  _play(kind){
    this.act = { kind, t: 0 };
    if (RABBIT.anims[kind]) this.facing = 1;
  },
  /* 一次性动作有多长（秒） */
  _actLen(kind){
    const R = RABBIT, A = R.anims, sum = (a, frames) => frames.reduce((s, f) => s + a.ms[f], 0) / 1000;
    if (kind === 'takeoff') return sum(A.jump_right, R.TAKEOFF);
    if (kind === 'boost') return sum(A.sec_right, R.BOOST);
    if (kind === 'land') return sum(A.jump_right, R.LAND);
    return A[kind].total;
  },
  _burst(x, y, n){
    for (let i = 0; i < n; i++) this.hearts.push({ x: x + rnd(-6, 6), y: y + rnd(-4, 4), vx: rnd(-14, 14), vy: rnd(-48, -30),
      t: 0, life: rnd(1.2, 1.8), size: rnd(5, 8), ph: rnd(0, TAU) });
  },
  _dust(x, y, n, spread){
    for (let i = 0; i < n; i++) this.puffs.push({ x: x + rnd(-spread, spread), y, vx: rnd(-1, 1) * spread * 2, t: 0, big: n > 1 });
  },

  /* ---------- 每帧 ---------- */
  update(dt){
    const t = (this.t += dt);
    const dir = this.dozing() ? 0 : (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);   // 睡着时不听方向键
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this._physics(dt, dir);
    const [cx, , cw] = CTRL;
    this.nearPanel = this.grounded && this.y > FLOOR_Y - 60 && Math.abs(this.x - (cx + cw / 2) * PX) < 60;
    // 椅子是飘着的，走起来不扬灰
    const walking = this.grounded && Math.abs(this.vx) > 20;
    this.walking = walking;
    // 番茄钟：专注时不睡、轮流播喝茶和吃苹果；休息刚开始伸个懒腰；长休息开头打个盹
    const P = typeof Pomo !== 'undefined' ? Pomo.t : null;
    const focusOn = !!(P && P.running && P.mode === 'focus'), breakOn = !!(P && P.running && P.mode !== 'focus');
    this.focusOn = focusOn;
    if (breakOn && !this.wasBreak){ this.stretchDue = true; this.breakNap = P.mode === 'long'; }
    if (!breakOn) this.stretchDue = this.breakNap = false;
    this.wasBreak = breakOn;
    // 懒腰等手上的动作做完再伸（番茄刚完成时先拍完手）；睡着的话先醒
    if (this.stretchDue && this.grounded && !this.act){ this.stretchDue = false; this.napT = -1; this._play('stretch'); }
    if (focusOn){
      this.napT = -1;
      const a = RABBIT.anims[this.focusA];
      if ((this.focusT += dt) >= a.total){
        this.focusT -= a.total;
        if (++this.focusLoops >= (this.focusA === 'focus_one' ? 12 : 8)){   // 喝茶约 13 秒、吃苹果约 11 秒，换着来
          this.focusA = this.focusA === 'focus_one' ? 'focus_two' : 'focus_one'; this.focusT = 0; this.focusLoops = 0;
        }
      }
    }
    // 打瞌睡：NAP_AFTER 秒没操控（或者长休息刚开始）→ 睡着。站在地上、家具、阁楼、床上都行，只要不在空中
    // 用真实时间算：窗口被挡住时浏览器会暂停画面，按帧算的话等多久都不会睡
    // 睡着以后按键都不管用（keyDown），点他一下才醒（click → wake）
    if (this.napT >= 0) this.napT += dt;
    else if (this.grounded && !this.act && !focusOn && Math.abs(this.vx) < 1
      && (Date.now() - this.lastInput > NAP_AFTER * 1000 || this.breakNap)){
      this.napT = 0; this.facing = 1; this.napHinted = false; this.breakNap = false;
    }
    // 睡着了，场景慢慢暗下来；醒了很快亮回去
    const asleep = this.napT >= 0;
    this.dim += ((asleep ? 1 : 0) - this.dim) * Math.min(1, dt * (asleep ? 1.2 : 4));
    if (!asleep && this.dim < 0.005) this.dim = 0;
    // 兔耳小鸟：在 rabbit 身后上方飞着跟随
    const b = this.bunny;
    const [tx, ty] = [this.x - this.facing * 58, this.y - 118];
    const k = Math.min(1, dt * 3.5);
    b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
    const birdSettled = Math.abs(tx - b.x) < 1 && Math.abs(ty - b.y) < 1;
    if (Math.abs(tx - b.x) > 3) b.facing = tx > b.x ? 1 : -1; else b.facing = this.facing;
    if (b.jump >= 0){ b.jump += dt / 0.5; if (b.jump > 1) b.jump = -1; }
    // 粒子
    for (let i = this.hearts.length - 1; i >= 0; i--){
      const p = this.hearts[i];
      p.t += dt; p.x += (p.vx + Math.sin(p.t * 4 + p.ph) * 10) * dt; p.y += p.vy * dt;
      if (p.t > p.life) this.hearts.splice(i, 1);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--){
      const p = this.puffs[i]; p.t += dt; p.x += p.vx * dt;
      if (p.t > 0.5) this.puffs.splice(i, 1);
    }
    // 一次性动作播完就清掉
    if (this.act){
      this.act.t += dt;
      if (this.act.t > this._actLen(this.act.kind)) this.act = null;
    }
    this._camera(dt, walking);
    this.settled = this.settled && birdSettled;
  },

  _physics(dt, dir){
    const t = this.t;
    // 左右：地上起步 / 刹车很快，空中稍慢但能转向
    this.vx += (dir * RUN - this.vx) * Math.min(1, dt * (this.grounded ? 22 : AIR_CONTROL));
    if (dir) this.facing = dir;
    this.x = clamp(this.x + this.vx * dt, WALL_L + KHW, WALL_R - KHW);
    // 走出平台边缘 → 开始下落（留一点「土狼时间」还能起跳）
    if (this.grounded && this.ground){
      const p = this.ground;
      if (this.x < p.x0 - 6 || this.x > p.x1 + 6){ this.grounded = false; this.ground = null; this.coyote = COYOTE; }
    }
    // 跳：提前一点按也算（缓冲），刚走出边缘也能跳（土狼时间）
    if (!this.grounded) this.coyote = Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)){
      this.vy = -JUMP_V; this.grounded = false; this.ground = null; this.coyote = 0; this.jumpBuf = 0;
      this.act = { kind: 'takeoff', t: 0 };
    } else if (this.jumpBuf > 0 && !this.grounded && this.airJumps > 0){
      // 二段跳：空中再推一下
      this.airJumps--; this.jumpBuf = 0;
      this.vy = -AIR_JUMP_V;
      this.act = { kind: 'boost', t: 0 };   // 二段跳：椅子底下喷火（老师画的）
      flap();
    }
    if (!this.jumpHeld && this.vy < -CUT_V) this.vy = -CUT_V;   // 松开空格：不再往上
    if (this.grounded) return;
    // 重力（下落更快；按住空格时最高点附近变轻）+ 落地
    let g = GRAV * (this.vy > 0 ? FALL_MUL : 1);
    if (this.jumpHeld && Math.abs(this.vy) < APEX_V) g *= APEX_GRAV;
    this.vy = Math.min(MAX_FALL, this.vy + g * dt);
    const prevY = this.y;
    this.y += this.vy * dt;
    if (this.y - KH < CEIL_Y + 4){ this.y = CEIL_Y + 4 + KH; this.vy = Math.max(0, this.vy); }   // 撞到屋顶
    if (this.vy < 0) return;
    let land = null, landY = Infinity;
    if (this.y >= FLOOR_Y){ land = 'floor'; landY = FLOOR_Y; }
    for (const p of PLATS){
      if (p === this.drop && t < this.dropUntil) continue;
      if (prevY <= p.y + 0.5 && this.y >= p.y && this.x >= p.x0 - 6 && this.x <= p.x1 + 6 && p.y < landY){ land = p; landY = p.y; }
    }
    if (!land) return;
    const impact = this.vy;
    this.y = landY; this.vy = 0; this.grounded = true; this.ground = land === 'floor' ? null : land;
    this.airJumps = AIR_JUMPS; this.groundY = landY;
    this.act = { kind: 'land', t: 0 };
    if (impact > 260){
      this._dust(this.x, this.y, 3, 10 * Math.min(1, impact / MAX_FALL) + 4);
    }
  },

  /* 镜头：平滑跟随，朝前多看一点；人站在画面偏下的位置；到地图边缘停住 */
  _camera(dt, walking){
    const la = this.facing * (walking ? 90 : 40);
    this.lookAhead += (la - this.lookAhead) * Math.min(1, dt * 1.8);
    const tx = clamp(this.x + this.lookAhead - VIEW_W / 2, 0, MAP_W - VIEW_W);
    // 竖直：按「最近站稳的高度」定镜头 → 原地小跳 / 二段跳时镜头不上下晃；
    // 人快跑出画面上沿 / 下沿（比如从高处往下掉）时才直接跟着人走
    let refY = this.groundY;
    const sy = this.y - this.cam.y;
    if (!this.grounded && (sy < VIEW_H * 0.3 || sy > VIEW_H * 0.86)) refY = this.y;
    if (!this.grounded && this.y > this.groundY + 40) refY = this.y;   // 掉到比原来低的地方
    const ty = clamp(refY - VIEW_H * 0.68, 0, MAP_H - VIEW_H);
    if (!this.camReady){ this.cam.x = tx; this.cam.y = ty; this.camReady = true; return; }
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 5);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * (this.vy > 300 ? 7 : 3.5));
    this.settled = Math.abs(tx - this.cam.x) < 0.5 && Math.abs(ty - this.cam.y) < 0.5 && Math.abs(la - this.lookAhead) < 1;
  },

  draw(){
    this.layout();
    const t = this.t, k = this.k, kd = this.kd;
    const VW = VIEW_W / PX, VH = VIEW_H / PX;               // 448 × 252 像素
    const q = v => Math.round(v * kd) / kd;                  // 对齐到屏幕像素
    const camX = q(this.cam.x / PX), camY = q(this.cam.y / PX);
    const ix = Math.floor(camX), iy = Math.floor(camY);
    // 1) 低分辨率画布（多 1 像素给镜头的小数部分）：远景 + 房子 + 会动的小东西
    if (!LO) LO = pxCanvas(VW + 1, VH + 1);
    const g = LO.getContext('2d');
    g.clearRect(0, 0, VW + 1, VH + 1);
    drawFar(g, t, ix, iy, VW + 1, VH + 1);
    drawHouseLayer(g, ix, iy, VW + 1, VH + 1);
    drawHouseLive(g, t, ix, iy);
    // 2) 画框 + 整数倍放大贴到屏幕上（镜头的小数部分用屏幕像素来挪 → 平滑）
    drawViewFrame(this.ox, this.oy, VW * k, VH * k, k);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath(); ctx.rect(this.ox, this.oy, VW * k, VH * k); ctx.clip();
    ctx.drawImage(LO, this.ox - (camX - ix) * k, this.oy - (camY - iy) * k, (VW + 1) * k, (VH + 1) * k);
    // 3) 人物和粒子：以像素为单位，直接画在屏幕上
    ctx.save();
    ctx.translate(this.ox - camX * k, this.oy - camY * k);
    ctx.scale(k, k);
    this._drawPuffs(q);
    this._drawBunny(q);
    this._drawRabbit(q);
    this._drawHearts(q);
    ctx.restore();
    // 4) 前景：比中景移动得多
    ctx.translate(this.ox, this.oy);
    ctx.scale(k, k);
    drawForeground(ctx, t, camX, camY, q);
    ctx.restore();
  },
  /* 现在画哪一帧：{ anim, i（第几帧）, dy（往下挪几像素，抵消画里自带的升高）}
     空中：起跳 / 二段跳先播一遍，之后停在「往上」或「往下掉」那一帧；
     地上：先看有没有正在播的一次性动作（落地、被点醒、拍手、伸懒腰），再看打瞌睡、番茄钟专注，最后是待机 */
  _frame(){
    const R = RABBIT, A = R.anims, dir = this.facing < 0 ? 'left' : 'right', act = this.act;
    const seq = (a, frames) => {   // 一次性动作（只播 frames 这几帧）播到第几帧；播完返回 -1
      let acc = 0;
      for (const f of frames){ acc += a.ms[f] / 1000; if (act.t < acc) return f; }
      return -1;
    };
    const jump = A['jump_' + dir];
    if (!this.grounded){
      if (act && act.kind === 'boost'){ const a = A['sec_' + dir], f = seq(a, R.BOOST); if (f >= 0) return { anim: a, i: f, dy: R.LIFT.sec[f] }; }
      if (act && act.kind === 'takeoff'){ const f = seq(jump, R.TAKEOFF); if (f >= 0) return { anim: jump, i: f, dy: R.LIFT.jump[f] }; }
      const f = this.vy < 0 ? R.RISE : R.FALL;
      return { anim: jump, i: f, dy: R.LIFT.jump[f] };
    }
    if (act && act.kind === 'land'){ const f = seq(jump, R.LAND); if (f >= 0) return { anim: jump, i: f, dy: 0 }; }
    if (act && A[act.kind]){ const f = rabbitFrame(A[act.kind], act.t, -1); if (f >= 0) return { anim: A[act.kind], i: f, dy: 0 }; }
    if (this.napT >= 0) return { anim: A.nap, i: rabbitFrame(A.nap, this.napT, R.NAP_LOOP), dy: 0 };
    if (this.focusOn) return { anim: A[this.focusA], i: rabbitFrame(A[this.focusA], this.focusT), dy: 0 };
    const idle = A['idle_' + dir];
    return { anim: idle, i: rabbitFrame(idle, this.t), dy: 0 };
  },
  _drawRabbit(q){
    const x = q(this.x / PX), y = q(this.y / PX), R = RABBIT, fr = this._frame();
    // 椅子底下的一圈淡金光（悬浮）
    const glow = 0.28 + Math.sin(this.t * 3) * 0.06 + (this.grounded ? 0 : -0.12);
    ctx.fillStyle = `rgba(255,200,110,${glow})`;
    ctx.fillRect(x - 12, y - 1, 24, 1); ctx.fillRect(x - 7, y, 14, 1);
    ctx.fillStyle = `rgba(255,230,160,${glow + 0.15})`; ctx.fillRect(x - 4, y - 1, 8, 1);
    const img = fr.anim.img;
    if (!img.complete || !img.naturalWidth) return;
    const ax = fr.anim.left ? R.AX.left : R.AX.right;
    ctx.drawImage(img, fr.i * R.W, 0, R.W, R.H, x - ax, y - R.HOVER - R.BASE - 1 + fr.dy, R.W, R.H);
  },
  _drawBunny(q){
    const b = this.bunny, t = this.t;
    const hop = b.jump >= 0 ? Math.round(Math.sin(b.jump * Math.PI) * 7) : 0;
    const bob = Math.round(Math.sin(t * 3) * 2);
    const fr = BUNNY[Math.floor(t * 9) % 2];
    ctx.drawImage(b.facing > 0 ? fr.r : fr.l, q(b.x / PX) - 7, q(b.y / PX) - 6 - hop + bob);
  },
  _drawPuffs(q){
    for (const p of this.puffs){
      const f = p.t / 0.5, x = q(p.x / PX), y = q(p.y / PX);
      if (p.ring){ pxEllipse(x, y - 1, 5 + f * 20, 2 + f * 5, `rgba(255,255,255,${0.9 * (1 - f)})`); continue; }
      const r = (p.big ? 3 : 2) + Math.floor(f * 3);
      ctx.fillStyle = `rgba(150,130,110,${0.45 * (1 - f)})`;
      for (let dy = -Math.ceil(r * 0.6); dy <= 0; dy++){
        const w = Math.round(r * Math.sqrt(1 - (dy / (r * 0.6 + 0.5)) ** 2));
        ctx.fillRect(x - w, y - 1 - Math.floor(f * 2) + dy, w * 2 + 1, 1);
      }
    }
  },
  _drawHearts(q){
    for (const p of this.hearts){
      if (p.life - p.t < 0.35 && Math.floor(p.t * 16) % 2) continue;
      ctx.drawImage(HEART, q(p.x / PX) - 3, q(p.y / PX) - 3);
    }
  },
};

let LO = null;   // 低分辨率画布（镜头看到的那一块）
/* 像素椭圆的边（双击跳时脚下散开的那一圈） */
function pxEllipse(cx, cy, rx, ry, col){
  ctx.fillStyle = col;
  const n = Math.ceil(TAU * Math.max(rx, ry)), seen = new Set();
  for (let i = 0; i < n; i++){
    const a = i / n * TAU, x = Math.round(Math.cos(a) * rx), y = Math.round(Math.sin(a) * ry), key = x * 1000 + y;
    if (seen.has(key)) continue;
    seen.add(key); ctx.fillRect(cx + x, cy + y, 1, 1);
  }
}
