"use strict";
/* ============================================================
   palette.js：纸色 / 七套主题色
   主题色用在：房间的地毯和墙、面板的淡彩（--wash）、习惯 / 倒数 / 四象限的颜色
   ============================================================ */

/* ---------- 纸色（背景的米色纸，带一点主题色） ---------- */
const PAPER = [243, 236, 221];    // 米色纸

/* ---------- 主题色系（莫兰迪低饱和） ---------- */
/* W 主色 / LT 亮部 / DK 暗部 */
const THEMES = [
  { name:'墨黑', W:[48,50,54],    LT:[66,69,74],    DK:[34,36,40] },
  { name:'透白', W:[240,243,241], LT:[248,250,248], DK:[219,226,222] },
  { name:'雨蓝', W:[168,190,200], LT:[199,215,223], DK:[143,167,178] },
  { name:'浅绿', W:[172,190,173], LT:[202,216,202], DK:[146,166,148] },
  { name:'浅粉', W:[213,187,192], LT:[228,208,212], DK:[187,159,165] },
  { name:'灰紫', W:[193,188,203], LT:[212,208,222], DK:[167,161,180] },
  { name:'浅金', W:[240,222,164], LT:[250,238,196], DK:[220,200,140] },
];
let themeIdx = 4;                   // 当前主题（默认浅粉，和原画一样）
let pal = THEMES[themeIdx];
/* 换主题时背景水彩慢慢晕开到新颜色 */
let washFrom = THEMES[themeIdx].W, washTo = THEMES[themeIdx].W, washT = 1;
const WASH_DUR = 1.2;
const lerpN = (a, b, t) => a + (b - a) * t;
const lerpC = (a, b, t) => [lerpN(a[0],b[0],t), lerpN(a[1],b[1],t), lerpN(a[2],b[2],t)];
const easeW = t => 1 - Math.pow(1 - t, 3);
const curWash = () => washT >= 1 ? washTo : lerpC(washFrom, washTo, easeW(washT));

function switchTheme(i){
  if (i === themeIdx || i < 0 || i >= THEMES.length) return;
  washFrom = curWash();
  themeIdx = i;
  pal = THEMES[i];
  washTo = THEMES[i].W;
  washT = 0;
  sceneChanged();
}
/* 开场恢复上次的主题：直接到位 */
function setThemeNow(i){
  if (i < 0 || i >= THEMES.length) return;
  themeIdx = i;
  pal = THEMES[i];
  washFrom = washTo = THEMES[i].W;
  washT = 1;
}
/* 主题 / 静音变了 → 通知应用层（保存设置、同步面板配色） */
function sceneChanged(){ if (typeof onSceneChange === 'function') onSceneChange(); }
