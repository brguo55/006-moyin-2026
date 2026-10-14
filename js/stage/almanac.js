"use strict";
/* ============================================================
   almanac.js：日子和天光 —— 二十四节气、今天是一天里的什么时候（白天 / 傍晚 / 夜里）
   节气用「寿星公式」算（21 世纪的常数 + 个别年份 ±1 天的修正），和万年历最多差一天
   ============================================================ */

const TERMS = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];
const TERM_C = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94];
const TERM_FIX = { '2019-0': -1, '2082-1': 1, '2026-3': -1, '2084-5': 1, '2008-9': 1, '2016-12': 1, '2002-14': 1, '2089-19': 1, '2089-20': 1, '2021-23': -1 };
const ymdOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* 某一年的 24 个节气：[{ name, i, day: 'YYYY-MM-DD' }]，第 i 个在 (i >> 1) + 1 月 */
const termCache = {};
function termsOf(year){
  if (termCache[year]) return termCache[year];
  const y = year % 100;
  return (termCache[year] = TERMS.map((name, i) => {
    const leaps = Math.trunc((i < 4 ? y - 1 : y) / 4);   // 1、2 月的四个节气按上一年数闰年
    const d = Math.floor(y * 0.2422 + TERM_C[i]) - leaps + (TERM_FIX[`${year}-${i}`] || 0);
    return { name, i, day: `${year}-${String((i >> 1) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }));
}
/* 这一天在哪个节气里：{ name, i, day（那个节气开始的日子）} */
function termAt(day){
  const year = +day.slice(0, 4), list = [...termsOf(year - 1).slice(-2), ...termsOf(year)];
  let cur = list[0];
  for (const t of list) if (t.day <= day) cur = t;
  return cur;
}
/* 今天的节气（按日期缓存，每帧调用也不费事） */
let nowTerm = { key: '', term: null };
function currentTerm(){
  const key = ymdOf(new Date());
  if (nowTerm.key !== key) nowTerm = { key, term: termAt(key) };
  return nowTerm.term;
}
/* 节气 → 季节（0 春 1 夏 2 秋 3 冬；立春起算） */
const termSeason = i => Math.floor(((i - 2 + 24) % 24) / 6);

/* ---------- 天光：按真实时间，白天 / 傍晚 / 夜里三个权重（加起来是 1），中间慢慢过渡 ----------
   5:00–6:00 夜 → 朝霞，6:00–7:00 朝霞 → 白天，16:30–18:00 白天 → 傍晚，18:00–19:30 傍晚 → 夜
   skyHourOverride：调试用，设成 0–24 的数就按那个钟点画 */
let skyHourOverride = null;
function skyMix(){
  const d = new Date(), h = skyHourOverride != null ? skyHourOverride : d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const ramp = (a, b) => Math.min(1, Math.max(0, (h - a) / (b - a)));
  if (h < 5 || h >= 19.5) return { day: 0, dusk: 0, night: 1 };
  if (h < 6){ const t = ramp(5, 6); return { day: 0, dusk: t, night: 1 - t }; }
  if (h < 7){ const t = ramp(6, 7); return { day: t, dusk: 1 - t, night: 0 }; }
  if (h < 16.5) return { day: 1, dusk: 0, night: 0 };
  if (h < 18){ const t = ramp(16.5, 18); return { day: 1 - t, dusk: t, night: 0 }; }
  const t = ramp(18, 19.5);
  return { day: 0, dusk: 1 - t, night: t };
}
