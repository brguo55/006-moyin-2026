"use strict";
/* ============================================================
   app/schedule.js：任务的时间、提醒、重复
   ------------------------------------------------------------
   task.time        'HH:MM'（可不填；有时间才有提醒）
   task.remind      提前几分钟提醒：0 = 准时；null = 不提醒（设时间时默认准时）
   task.remindedAt  已经提醒过的那个时间点（毫秒）：同一个时间点只提醒一次；改了时间就会重新提醒
   task.repeat      { type: 'day' | 'weekday' | 'week' | 'month' | 'year', days（每周：0 = 周日 … 6 = 周六）, monthDay, month, day }
   做完一件重复的任务，就照着规则生成下一次（tasks.js 的 toggleDone）
   提醒只在听雨开着的时候能响（网页没有服务器推送）；系统通知要先允许
   ============================================================ */

const REMIND_OPTS = [[0, '准时'], [5, '提前 5 分钟'], [15, '提前 15 分钟'], [30, '提前 30 分钟'], [60, '提前 1 小时'], [1440, '提前 1 天']];
const REPEAT_OPTS = [['', '不重复'], ['day', '每天'], ['weekday', '工作日（周一到周五）'], ['week', '每周'], ['month', '每月'], ['year', '每年']];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];   // 周一在前

/* 截止的那一刻（毫秒）：有时间用时间，没有就是那天 0 点 */
function dueAt(t){
  const [y, m, d] = t.due.split('-').map(Number), [hh, mm] = (t.time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}
/* 「今天 15:00」 */
const dueText = t => dueLabel(t.due) + (t.time ? ' ' + t.time : '');
/* 过期了：日期过了，或者今天定的时间已经过了 */
const isLate = t => !t.done && !!t.due && (t.due < dayKey() || (!!t.time && dueAt(t) < Date.now()));

/* ---------- 重复 ---------- */
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();   // m：0–11
/* 按截止日期定规则：每周 = 那天星期几（换日期时保留已选的星期）；每月 = 几号；每年 = 几月几号 */
function makeRepeat(type, due, keep){
  if (!type) return null;
  const d = keyToDate(due);
  if (type === 'week') return { type, days: keep && keep.type === 'week' && keep.days && keep.days.length ? keep.days.slice() : [d.getDay()] };
  if (type === 'month') return { type, monthDay: d.getDate() };
  if (type === 'year') return { type, month: d.getMonth() + 1, day: d.getDate() };
  return { type };
}
/* 这一天符合规则吗（每月 31 号在小月算月底那天；2 月 29 号在平年算 28 号） */
function repeatHits(rep, d){
  const wd = d.getDay(), last = daysIn(d.getFullYear(), d.getMonth());
  switch (rep.type){
    case 'day': return true;
    case 'weekday': return wd >= 1 && wd <= 5;
    case 'week': return (rep.days && rep.days.length ? rep.days : [wd]).includes(wd);
    case 'month': return d.getDate() === Math.min(rep.monthDay || 1, last);
    case 'year': return d.getMonth() + 1 === rep.month && d.getDate() === Math.min(rep.day || 1, last);
  }
  return false;
}
/* 下一次：这次的日期（或者今天，取晚的那个）之后，第一个符合规则的日子 */
function nextDue(rep, from){
  const today = dayKey(), d = keyToDate(from > today ? from : today);
  for (let i = 0; i < 800; i++){
    d.setDate(d.getDate() + 1);
    if (repeatHits(rep, d)) return dayKey(d);
  }
  return null;
}
function repeatLabel(rep){
  if (!rep) return '';
  if (rep.type === 'week') return '每周' + WEEK_ORDER.filter(x => (rep.days || []).includes(x)).map(x => WEEK[x]).join('、');
  if (rep.type === 'month') return `每月 ${rep.monthDay} 日`;
  if (rep.type === 'year') return `每年 ${rep.month} 月 ${rep.day} 日`;
  return { day: '每天', weekday: '工作日' }[rep.type] || '';
}

/* ---------- 提醒：每 20 秒看一眼（切回窗口时也看）；错过超过 6 小时的（比如听雨关着）就不补了 ---------- */
const Reminders = {
  /* 该提醒的时间点（毫秒）；没设时间或不提醒 = null */
  at(t){ return t.due && t.time && t.remind != null ? dueAt(t) - t.remind * 60e3 : null; },
  /* 改了时间 / 提醒、导入、挪到今天之后：已经过去的时间点算提醒过了，不补响 */
  settle(t){ const at = this.at(t); if (at != null && at <= Date.now()) t.remindedAt = at; },
  /* 第一次设时间时，问一下能不能发系统通知 */
  askPermission(){ if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); },
  check(){
    if (!Store.data) return;
    const now = Date.now(), hit = [];
    for (const t of Store.data.tasks){
      const at = t.done ? null : this.at(t);
      if (at != null && at <= now && t.remindedAt !== at) hit.push([t.id, at]);
    }
    if (!hit.length) return;
    Store.update(d => { for (const [id, at] of hit){ const x = d.tasks.find(y => y.id === id); if (x) x.remindedAt = at; } }, true);
    const ts = hit.filter(([, at]) => now - at < 6 * 3600e3).map(([id]) => Store.data.tasks.find(t => t.id === id)).filter(Boolean);
    if (ts.length) this.notify(ts);
  },
  notify(ts){
    bell();
    toast('提醒：' + ts.map(t => `${t.title}（${dueText(t)}）`).join('、'));
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    for (const t of ts){
      try {
        const n = new Notification(t.title, { body: dueText(t) + ' · 听雨', icon: 'icons/icon-192.png', tag: 'tingyu-' + t.id });
        n.onclick = () => { window.focus(); Tasks.reveal(t.id); n.close(); };   // 点通知：回到听雨、打开这个任务
      } catch (e){}
    }
  },
  start(){
    this.check();
    setInterval(() => this.check(), 20e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  },
};
