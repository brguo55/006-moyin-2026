"use strict";
/* ============================================================
   sprites.js：像素角色 —— rabbit（老师画的帧动画）、兔耳小鸟、爱心
   ------------------------------------------------------------
   rabbit 的动画在 assets/rabbit/ 下，文件名照 moyin 文件夹里的（00_idle_rabbit_right……），
   原来的 GIF 转成同名的 PNG 帧条：每帧 80 × 112 像素，横着排成一条
   锚点：椅子底的中点在第 AX 列、第 BASE 行；画的时候椅子底离地 HOVER 像素（飘着）
   rabbit 左右两边不对称（一边衣服、一边机械），不能镜像，所以左右各一套
   ============================================================ */

const RABBIT = {
  W: 80, H: 112, BASE: 90, HOVER: 6,
  AX: { right: 39, left: 40 },
  /* file：assets/rabbit/ 下的文件名（和 moyin 文件夹里的 GIF 同名）；ms：每帧多少毫秒（照原 GIF） */
  anims: {
    idle_right: { file: '00_idle_rabbit_right',     ms: [100, 100, 100, 100, 100, 100] },
    idle_left:  { file: '01_idle_rabbit_left',      ms: [100, 100, 100, 100, 100, 100] },
    jump_right: { file: '02_jump_rabbit_right',     ms: [100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80] },
    jump_left:  { file: '03_jump_rabbit_left',      ms: [100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80] },
    sec_right:  { file: '04_jump_sec_rabbit_right', ms: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80] },
    sec_left:   { file: '05_jump_sec_rabbit_left',  ms: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80] },
    // 下面这些只有朝右：播的时候 rabbit 会先转成朝右
    nap:        { file: '20_nap_rabbit',       ms: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },   // 打瞌睡：前 3 帧睡着，之后循环冒 Zzz
    click:      { file: '21_click_rabbit',     ms: [100, 100, 100, 100, 100, 100, 300, 350] },                  // 被点一下（配上红色爱心）；睡着时被点醒也是它
    focus_one:  { file: '40_focus_rabbit_one', ms: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },   // 番茄钟专注：喝茶
    focus_two:  { file: '41_focus_rabbit_two', ms: [100, 100, 100, 100, 100, 100, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80] },   // 番茄钟专注：吃苹果
    done:       { file: '60_done_rabbit',      ms: [100, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 100] },   // 完成一件事：拍手
    stretch:    { file: '61_stretch_rabbit',   ms: [80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 100] },   // 番茄钟休息开始：伸懒腰
  },
  /* 跳跃动画是「原地跳」：画里椅子自己会升高。每帧椅子比平时高了多少像素 ——
     在空中播的时候把这段减掉，跳多高由游戏的物理决定，动作和气环、喷火照样保留 */
  LIFT: {
    jump: [0, 2, 16, 19, 17, 7, 2, -3, -4, -3, -1],
    sec:  [0, 2, 16, 19, 17, 7, 10, 18, 31, 33, 29, 16, 2, -3, -4, -3, -1],
  },
  TAKEOFF: [1, 2, 3, 4],              // 起跳：脚下一圈气环（jump 动画里的这几帧）
  BOOST:   [6, 7, 8, 9, 10, 11],      // 二段跳：椅子底下喷火再冲一截（sec 动画）
  RISE: 5, FALL: 6,                   // 在空中：往上时 / 往下掉时停在这两帧
  LAND:    [7, 8, 9, 10],             // 落地：往下一沉再回来（jump 动画）
  NAP_LOOP: 3,                        // 打瞌睡从第 3 帧开始循环
};
for (const a of Object.values(RABBIT.anims)){
  a.n = a.ms.length; a.left = a.file.endsWith('_left');
  a.cum = [0]; for (const m of a.ms) a.cum.push(a.cum[a.cum.length - 1] + m / 1000);   // 每帧从第几秒开始
  a.total = a.cum[a.n];
  a.img = new Image(); a.img.src = 'assets/rabbit/' + a.file + '.png';
}
/* 播到第 t 秒是第几帧。loop：从第 loop 帧开始循环（前面几帧只播一次）；loop = -1 不循环，播完返回 -1 */
function rabbitFrame(a, t, loop = 0){
  if (t >= a.total){
    if (loop < 0) return -1;
    const head = a.cum[loop];
    t = head + (t - head) % (a.total - head);
  }
  let i = 0;
  while (i < a.n - 1 && t >= a.cum[i + 1]) i++;
  return i;
}

/* ---------- 兔耳小鸟（两帧：翅膀放下 / 扬起）---------- */
const BP = { k: '#3a2a2a', P: '#f4abb6', D: '#dd8997', E: '#fdf3f3', I: '#f9cdcf', O: '#f0b85a' };
const BUNNY_A = [
  '..kk..kk......',
  '.kEEk.kEEk....',
  '.kEIk.kIEk....',
  '.kEIk.kIEk....',
  '..kEkkkEk.....',
  '..kPPPPPPkk...',
  '.kPPPPPPPPPk..',
  'kPPPPPPPkPPPk.',
  'kPPPPPPPPPPOOk',
  'kPDDDPPPPPPkk.',
  'kPPDDDPPPPPk..',
  '.kPPPPPPPPk...',
  '..kkkkkkkk....',
];
const BUNNY_B = [
  '..kk..kk......',
  '.kEEk.kEEk....',
  '.kEIk.kIEk....',
  '.kEIk.kIEk....',
  '..kEkkkEk.....',
  '..kPPPPPPkk...',
  '.kPPPPPPPPPk..',
  'kkkkPPPPkPPPk.',
  'kDDDkPPPPPPOOk',
  '.kDDkPPPPPPkk.',
  '..kkPPPPPPPk..',
  '.kPPPPPPPPk...',
  '..kkkkkkkk....',
];
const BUNNY = [BUNNY_A, BUNNY_B].map(rows => ({ r: makeSprite(rows, BP, false), l: makeSprite(rows, BP, true) }));

/* ---------- 爱心 ---------- */
const HEART = makeSprite([
  '.rr.rr.',
  'rhrrrrR',
  'rrrrrrR',
  '.rrrrR.',
  '..rRR..',
  '...R...',
], { r: '#e6646d', R: '#c24f5a', h: '#fbd0d3' });
