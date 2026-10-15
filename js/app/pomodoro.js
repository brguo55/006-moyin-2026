"use strict";
/* ============================================================
   app/pomodoro.js：番茄钟 —— 三种计时方式，可关联任务，统计，沉浸模式
   ------------------------------------------------------------
   番茄钟：专注 → 休息算一个循环，可以选跑几个循环（或不限），开始后自动一段接一段
   计时器：设一个时长倒数，到点响铃，一次就完
   正计时：从 0 往上数，看看一共连续工作了多久；按「结束并记录」记下来
   ------------------------------------------------------------
   倒数按「结束时刻」算，正计时按「从什么时候开始 + 之前累计」算，都不靠累加：
   窗口在后台被浏览器降频也不会走慢；滴答由一个小 Worker 发出（后台页面里普通定时器可能被压到一分钟一次）。
   进行中的计时存在 KV 'timer'：刷新 / 关掉再开都能接着走；离开期间到点的番茄照样记上。
   ============================================================ */

/* 时长（秒）↔「分:秒」：1505 ↔ "25:05"；只填一个数就当分钟（"25" = 25:00） */
const fmtDur = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
function parseDur(str){
  const m = String(str).trim().replace('：', ':').match(/^(\d{1,3})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const s = m[2] == null ? 0 : +m[2];
  return s < 60 ? +m[1] * 60 + s : null;
}
/* 正计时的显示：不到一小时 mm:ss，超过就 h:mm:ss */
const fmtClock = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600); return h ? `${h}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}` : mmss(ms); };

const KINDS = {
  pomo:  { name: '番茄钟' },
  timer: { name: '计时器' },
  watch: { name: '正计时' },
};
const MODES = {
  focus: { name: '专注',   key: 'focusSec', max: 180 * 60 },
  short: { name: '短休息', key: 'shortSec', max: 60 * 60 },
  long:  { name: '长休息', key: 'longSec',  max: 120 * 60 },
};
const CYCLE_OPTS = [1, 2, 3, 4, 5, 6, 8, 0];   // 0 = 不限

const Pomo = {
  t: { kind: 'pomo', mode: 'focus', running: false, endAt: 0, left: 25 * 60e3, startedAt: 0, cycle: 0, taskId: null,
       round: 0,                  // 番茄钟：这一轮已经做完几个专注
       watchAcc: 0, watchFrom: 0 },   // 正计时：之前累计的毫秒；正在走时从什么时候开始
  el: {},

  /* 当前这一段有多长（毫秒） */
  dur(mode = this.t.mode){
    const s = Store.data.settings;
    if (this.t.kind === 'timer') return (s.timerSec || 600) * 1000;
    return (s[MODES[mode].key] || 1500) * 1000;
  },
  remaining(){ return this.t.running ? Math.max(0, this.t.endAt - Date.now()) : this.t.left; },
  elapsed(){ const t = this.t; return t.watchAcc + (t.running ? Date.now() - t.watchFrom : 0); },
  /* 现在要显示的时间和进度（面板、沉浸模式、茶室挂轴都用它）：[「分:秒」, 0–1] */
  display(){
    if (this.t.kind === 'watch'){ const ms = this.elapsed(), s = Math.floor(ms / 1000); return [`${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`, (ms % 3600e3) / 3600e3]; }
    const left = this.remaining();
    return [mmss(left), 1 - left / this.dur()];
  },
  /* 现在这一段叫什么 */
  label(){ return this.t.kind === 'pomo' ? MODES[this.t.mode].name : KINDS[this.t.kind].name; },
  _save(){ KV.set('timer', this.t); },

  async init(){
    const saved = await KV.get('timer');
    if (saved) Object.assign(this.t, saved);
    else this.t.left = this.dur('focus');
    if (this.t.running && this.t.kind !== 'watch' && this.t.endAt <= Date.now()) this.finish(true);   // 离开期间到点了
    // 滴答：优先用 Worker（后台不被降频），不行就退回普通定时器
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 500)'], { type: 'text/javascript' })));
      w.onmessage = () => this.tick();
    } catch (e){ setInterval(() => this.tick(), 500); }
    this.tick();
  },
  tick(){
    if (this.t.running && this.t.kind !== 'watch' && Date.now() >= this.t.endAt) return this.finish(false);
    this.paint();
  },

  /* ---------- 控制 ---------- */
  start(){
    initAudio();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const t = this.t;
    if (!t.startedAt) t.startedAt = Date.now();
    if (t.kind === 'watch') t.watchFrom = Date.now();
    else {
      if (!t.left || t.left <= 0) t.left = this.dur();
      t.endAt = Date.now() + t.left;
    }
    t.running = true;
    this._save(); this.refresh();
  },
  pause(){
    const t = this.t;
    if (t.kind === 'watch') t.watchAcc += Date.now() - t.watchFrom;
    else t.left = Math.max(0, t.endAt - Date.now());
    t.running = false;
    this._save(); this.refresh();
  },
  /* 重置：番茄钟回到这一轮的开头（循环数清零） */
  reset(){
    Object.assign(this.t, { running: false, mode: 'focus', startedAt: 0, round: 0, watchAcc: 0 });
    this.t.left = this.dur();
    this._save(); this.refresh();
  },
  setMode(mode){
    Object.assign(this.t, { mode, running: false, startedAt: 0 });
    this.t.left = this.dur(mode);
    this._save(); this.refresh();
  },
  /* 换计时方式（番茄钟 / 计时器 / 正计时）：只能在没走的时候换 */
  setKind(kind){
    if (this.t.running) return;
    Object.assign(this.t, { kind, mode: 'focus', startedAt: 0, round: 0, watchAcc: 0 });
    this.t.left = this.dur();
    this._save(); this.refresh();
  },
  /* 跳过：番茄钟直接进入下一段（这一段不计数）；计时器 / 正计时就是重置 */
  skip(){
    const t = this.t;
    if (t.kind !== 'pomo') return this.reset();
    if (t.mode === 'focus'){ t.round++; this.setMode(this._nextBreak(t.cycle + 1)); }
    else if (this._runDone()){ t.round = 0; this.setMode('focus'); }
    else this.setMode('focus');
  },
  _nextBreak(cycle){ return cycle % (Store.data.settings.longEvery || 4) === 0 ? 'long' : 'short'; },
  /* 这一轮设定的循环都做完了吗（不限 = 永远没做完） */
  _runDone(){ const n = Store.data.settings.cycles; return n > 0 && this.t.round >= n; },
  setTask(id){ this.t.taskId = id || null; this._save(); this.refresh(); },
  _record(kind, start, end, ms){
    Store.update(d => d.pomos.push({ id: uid(), kind, start, end, minutes: Math.round(ms / 6e3) / 10, taskId: this.t.taskId }));
  },

  /* 到点（番茄钟 / 计时器）：记下来 → 响铃 + 系统通知 → 番茄钟自动接着下一段，直到循环做完 */
  finish(silent){
    const t = this.t, end = t.running ? t.endAt : Date.now(), n = Store.data.settings.cycles;
    let msg, next = false;
    if (t.kind === 'timer'){
      this._record('timer', t.startedAt || end - this.dur(), end, this.dur());
      msg = ['计时结束', `${fmtDur(Math.round(this.dur() / 1000))} 到了。`];
      this.reset();
      if (!silent) celebrate();
    } else if (t.mode === 'focus'){
      this._record('pomo', t.startedAt || end - this.dur('focus'), end, this.dur('focus'));
      t.cycle++; t.round++;
      msg = ['专注完成', `完成第 ${this._today().count} 个番茄${n ? `（这一轮 ${t.round} / ${n}）` : ''}，休息一下吧。`];
      this.setMode(this._nextBreak(t.cycle));
      next = true;                                     // 一个循环 = 专注 + 休息：休息自动开始
      if (!silent) celebrate();
    } else if (this._runDone()){
      msg = ['这一轮完成', `${n} 个循环都做完了，辛苦啦。`];
      t.round = 0;
      this.setMode('focus');
    } else {
      msg = ['休息结束', '下一个番茄开始了。'];
      this.setMode('focus');
      next = true;
    }
    if (silent) { toast(`离开期间：${msg[0]}`); return; }   // 离开期间到点的：记上，但不自动往下走
    if (next) this.start();
    bell();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden){
      try { new Notification(msg[0] + ' · 听雨', { body: msg[1], icon: 'icons/icon-192.png', silent: true }); } catch (e){}
    }
    toast(msg[0] + '。' + msg[1]);
  },
  /* 正计时：结束并记录这一次连续工作了多久（不到 1 分钟就不记） */
  stopWatch(){
    const t = this.t, ms = this.elapsed(), end = Date.now();
    if (ms >= 60e3){
      this._record('watch', t.startedAt || end - ms, end, ms);
      toast(`这次连续工作了 ${fmtClock(ms)}，已经记下来了。`);
      celebrate();
    } else toast('不到 1 分钟，这次就不记了。');
    this.reset();
  },

  /* 最近 n 天（今天在最后）每天的记录，按结束时间分：先算好每天 0 点的时刻，记录扫一遍就分完 */
  _byDay(n){
    const keys = [...Array(n)].map((_, i) => addDays(dayKey(), i - n + 1));
    const edges = [...keys, addDays(keys[n - 1], 1)].map(k => keyToDate(k).getTime());
    const days = keys.map(() => []);
    for (const p of Store.data.pomos){
      if (!(p.end >= edges[0] && p.end < edges[n])) continue;
      let i = n - 1;
      while (p.end < edges[i]) i--;
      days[i].push(p);
    }
    return { keys, days };
  },
  _today(ps = this._byDay(1).days[0]){
    return {
      count: ps.filter(p => !p.kind || p.kind === 'pomo').length,
      minutes: ps.reduce((s, p) => s + (p.minutes || 0), 0),
      longest: ps.filter(p => p.kind === 'watch').reduce((m, p) => Math.max(m, p.minutes || 0), 0),
    };
  },

  /* ---------- 界面 ---------- */
  mount(root){
    const e = this.el;
    e.kinds = h('div.modes.kinds');
    e.modes = h('div.modes');
    e.time = h('div.big-time');
    e.ring = h('div.pomo-ring', null, e.time);
    e.round = h('div.pomo-round');
    e.btns = h('div.pomo-btns');
    e.task = h('select.pomo-task', { onchange: ev => this.setTask(ev.target.value) });
    e.stats = h('div.pomo-stats');
    e.week = h('div.week-bars');
    e.cfg = h('details.pomo-cfg', null, h('summary', null, '时长设置'), h('div.cfg-grid'));
    root.append(e.kinds, e.modes, e.ring, e.round, e.btns, h('label.pomo-task-row', null, '专注于 ', e.task), e.stats, e.week, e.cfg);

    // 沉浸模式：面板收起，场景铺满，计时浮在水景上方
    e.immMode = h('div.imm-mode'); e.immTime = h('div.imm-time'); e.immTask = h('div.imm-task');
    e.immToggle = h('button.btn.imm-toggle', { onclick: () => this.t.running ? this.pause() : this.start() });
    e.imm = h('div#immersive', null, e.immMode, e.immTime, e.immTask,
      h('div.imm-btns', null, e.immToggle, h('button.btn.ghost', { onclick: () => App.immersive(false) }, '退出沉浸')));
    document.body.append(e.imm);
  },
  refresh(){
    const e = this.el, t = this.t, s = Store.data.settings;
    if (!e.modes) return;
    // 计时方式：番茄钟 / 计时器 / 正计时（走着的时候不能换）
    e.kinds.replaceChildren(...Object.entries(KINDS).map(([k, m]) =>
      h('button.chip' + (t.kind === k ? '.on' : ''), { onclick: () => this.setKind(k), disabled: t.running && t.kind !== k }, m.name)));
    // 番茄钟才有：专注 / 短休息 / 长休息
    e.modes.hidden = t.kind !== 'pomo';
    e.modes.replaceChildren(...Object.entries(MODES).map(([k, m]) =>
      h('button.chip' + (t.mode === k ? '.on' : ''), { onclick: () => this.setMode(k), disabled: t.running }, m.name)));
    // 循环进度 / 说明
    const n = s.cycles;
    e.round.textContent = t.kind === 'pomo' ? (n ? `第 ${Math.min(n, t.round + (t.mode === 'focus' ? 1 : 0))} / ${n} 个循环` : `已完成 ${t.round} 个循环 · 不限`)
      : t.kind === 'timer' ? `倒数 ${fmtDur(s.timerSec || 600)}` : '从 0 开始数，看看连续工作了多久';
    const started = t.kind === 'watch' ? (t.running || t.watchAcc > 0) : (t.running || t.left < this.dur());
    e.btns.replaceChildren(...[   // replaceChildren 会把 null 变成文字「null」，先滤掉
      t.running ? h('button.btn.primary', { onclick: () => this.pause() }, '暂停')
                : h('button.btn.primary', { onclick: () => this.start() }, started ? '继续' : '开始'),
      t.kind === 'watch' && started ? h('button.btn', { onclick: () => this.stopWatch() }, '结束并记录') : null,
      started || t.round ? h('button.btn.ghost', { onclick: () => this.reset() }, '重置') : null,
      t.kind === 'pomo' ? h('button.btn.ghost', { onclick: () => this.skip(), title: '直接进入下一段，不计数' }, '跳过') : null,
      h('button.btn.ghost', { onclick: () => App.immersive(true) }, '沉浸'),
    ].filter(Boolean));
    const undone = Store.data.tasks.filter(x => !x.done || x.id === t.taskId);
    e.task.replaceChildren(h('option', { value: '' }, '不关联任务'),
      ...undone.map(x => h('option', { value: x.id, selected: x.id === t.taskId }, x.title)));

    // 今日 + 最近 7 天
    const isPomo = p => !p.kind || p.kind === 'pomo';
    const week = this._byDay(7), td = this._today(week.days[6]), total = Store.data.pomos.filter(isPomo).length;
    e.stats.replaceChildren(
      h('div.stat', null, h('b', null, td.count), h('span', null, '今日番茄')),
      h('div.stat', null, h('b', null, Math.round(td.minutes)), h('span', null, '今日专注（分钟）')),
      t.kind === 'watch' ? h('div.stat', null, h('b', null, Math.round(td.longest)), h('span', null, '今日最长连续（分钟）'))
        : h('div.stat', null, h('b', null, total), h('span', null, '累计番茄')),
    );
    const counts = week.days.map(ps => ps.filter(isPomo).length);
    const max = Math.max(4, ...counts);
    e.week.replaceChildren(...week.keys.map((k, i) => h('div.wb', { title: `${k}：${counts[i]} 个番茄` },
      h('div.wb-bar', { style: { height: (counts[i] / max * 100) + '%' } }),
      h('div.wb-n', null, counts[i] || ''),
      h('div.wb-d', null, i === 6 ? '今' : WEEK[keyToDate(k).getDay()]))));

    // 时长设置（设置页里也有同样的一份）
    e.cfg.hidden = t.kind === 'watch';
    e.cfg.querySelector('.cfg-grid').replaceChildren(...this.cfgFields(t.kind));
    this.paint();
  },
  /* 时长设置的输入框：时长都填「分:秒」（25、25:00、25:05 都行）
     kind：番茄钟 → 专注 / 短休息 / 长休息 / 几个循环 / 几个后长休息；计时器 → 计时时长；不传 → 全部（设置页用） */
  cfgFields(kind){
    const s = Store.data.settings;
    const afterChange = () => { if (!this.t.running && !this.t.startedAt) this.setMode(this.t.mode); };   // 还没开始的这段按新时长重置
    const dur = (label, key, max) => h('label', null, label,
      h('input.dur-input', { type: 'text', inputMode: 'numeric', value: fmtDur(s[key]), placeholder: '25:00', title: '填「分:秒」，比如 25:00 或 25:05',
        onkeydown: ev => { if (ev.key === 'Enter') ev.target.blur(); },
        onchange: ev => {
          const v = parseDur(ev.target.value);
          if (v == null || v < 10 || v > max){
            toast(`时长要像 25:00 或 25:05 这样填，在 0:10 到 ${fmtDur(max)} 之间`);
            ev.target.value = fmtDur(s[key]); return;
          }
          ev.target.value = fmtDur(v);
          Store.update(d => { d.settings[key] = v; });
          afterChange();
        } }));
    const pomo = [
      dur('专注（分:秒）', 'focusSec', MODES.focus.max), dur('短休息', 'shortSec', MODES.short.max), dur('长休息', 'longSec', MODES.long.max),
      h('label', null, '一轮几个循环', h('select', { onchange: ev => { Store.update(d => { d.settings.cycles = +ev.target.value; }); } },
        ...CYCLE_OPTS.map(v => h('option', { value: v, selected: s.cycles === v }, v ? `${v} 个（专注 + 休息）` : '不限')))),
      h('label', null, '几个番茄后长休息', h('input', { type: 'number', min: 2, max: 12, value: s.longEvery, onchange: ev => {
        const v = Math.min(12, Math.max(2, Math.round(+ev.target.value) || s.longEvery));
        ev.target.value = v;
        Store.update(d => { d.settings.longEvery = v; });
      } })),
    ];
    const timer = [dur('计时器时长', 'timerSec', 600 * 60)];
    return kind === 'pomo' ? pomo : kind === 'timer' ? timer : [...pomo, ...timer];
  },
  /* 每次滴答（半秒一次）只更新数字；和上次一样的就不碰（暂停着的时候什么都不用改） */
  paint(){
    const e = this.el, t = this.t;
    if (!e.time) return;
    const [, frac] = this.display(), txt = t.kind === 'watch' ? fmtClock(this.elapsed()) : mmss(this.remaining());
    setText(e.time, txt);
    const deg = (Math.max(0, Math.min(1, frac)) * 360).toFixed(1) + 'deg';
    if (deg !== this._deg){ this._deg = deg; e.ring.style.setProperty('--p', deg); }
    e.ring.classList.toggle('running', t.running);
    const task = t.taskId ? Store.data.tasks.find(x => x.id === t.taskId) : null;
    const started = t.kind === 'watch' ? t.watchAcc > 0 : t.left < this.dur();
    setText(e.immMode, this.label() + (t.running ? '' : ' · 已暂停'));
    setText(e.immTime, txt);
    setText(e.immTask, task ? task.title : '');
    setText(e.immToggle, t.running ? '暂停' : (started ? '继续' : '开始'));
    const title = t.running ? `${txt} ${this.label()} · 听雨` : '听雨';
    if (document.title !== title) document.title = title;
    App.timerBadge(t.running ? txt : '');
  },
};
