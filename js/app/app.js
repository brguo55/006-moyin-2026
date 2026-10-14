"use strict";
/* ============================================================
   app/app.js：外壳 —— 右侧手绘面板（任务 / 轻重 / 番茄 / 习惯 / 倒数 / 日记 / 设置）、
   备份提醒横幅、沉浸模式、放大（面板或场景铺满窗口）、跟着水色变的面板配色、启动流程
   ============================================================ */

const TABS = [
  { id: 'tasks',  name: '任务', mod: Tasks,     label: '任务' },
  { id: 'matrix', name: '轻重', mod: Matrix,    label: '轻重（四象限）' },   // 艾森豪威尔矩阵
  { id: 'pomo',   name: '番茄', mod: Pomo,      label: '番茄钟' },
  { id: 'habits', name: '习惯', mod: Habits,    label: '习惯打卡' },
  { id: 'count',  name: '倒数', mod: Countdown, label: '倒数日' },
  { id: 'diary',  name: '日记', mod: Diary,     label: '日记' },
  { id: 'set',    name: '设置', mod: Settings },   // 设置永远显示（不然关掉就找不回来了）
];
/* 这个功能要不要显示在面板里：设置页总是显示；其余看设置里的勾选 */
const tabShown = id => id === 'set' || !(Store.data && Store.data.settings.hidden.includes(id));
const PANEL_W = 380, PANEL_GAP = 16, NARROW = 760;

/* 只是本机界面习惯（开没开面板、面板放没放大、上次在哪个页签），不算数据，放 localStorage */
const ui = (() => { try { return JSON.parse(localStorage.getItem('tingyu-ui')) || {}; } catch (e){ return {}; } })();
const saveUi = () => { try { localStorage.setItem('tingyu-ui', JSON.stringify(ui)); } catch (e){} };

/* 放大 / 恢复：四个角朝外 / 朝里（和场景左上角的放大按钮一样） */
const MAX_ICON = {
  on:  pixSvg(['kkk..kkk', 'k......k', 'k......k', '........', '........', 'k......k', 'k......k', 'kkk..kkk']),
  off: pixSvg(['..k..k..', '..k..k..', 'kkk..kkk', '........', '........', 'kkk..kkk', '..k..k..', '..k..k..']),
};

const App = {
  tab: ui.tab || 'tasks',
  open: ui.open !== false,
  max: !!ui.max,       // 面板放大：铺满整个窗口
  el: {},

  build(){
    const e = this.el;
    e.tabs = h('nav.tabs', null, ...TABS.map(t => h('button.tab', { 'data-tab': t.id, onclick: () => this.showTab(t.id) }, t.name)));
    e.banner = h('div.banner');
    e.body = h('div.panel-body');
    e.sections = {};
    for (const t of TABS){
      const sec = h('section.tab-page', { 'data-tab': t.id });
      t.mod.mount(sec);
      e.sections[t.id] = sec;
      e.body.append(sec);
    }
    e.maxBtn = h('button.icon-btn.max-btn', { onclick: () => this.setMax(!this.max) });
    e.panel = h('aside#panel', null,
      h('header.panel-head', null,
        h('div.brand', null, h('span.brand-name', null, '听雨'), h('span.brand-date', null, this._dateLine())),
        h('div.head-btns', null, e.maxBtn,
          h('button.icon-btn', { title: '收起面板（场景放大）', onclick: () => this.setOpen(false) }, '›'))),
      e.tabs, e.banner, e.body);
    e.opener = h('button#opener', { title: '打开面板', onclick: () => this.setOpen(true) }, h('span.op-name', null, '听雨'), h('span.op-timer'));
    document.body.append(e.panel, e.opener);
    addEventListener('resize', () => this.layout());
    addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.body.classList.contains('immersive')) this.immersive(false); });
  },
  _dateLine(){ const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK[d.getDay()]}`; },

  showTab(id){
    if (!tabShown(id)) id = TABS.find(t => tabShown(t.id)).id;
    this.tab = id; ui.tab = id; saveUi();
    for (const b of this.el.tabs.children) b.classList.toggle('on', b.dataset.tab === id);
    for (const [k, s] of Object.entries(this.el.sections)) s.hidden = k !== id;
    if (!this.open) this.setOpen(true);
    this.render();
  },
  render(){
    // 当前页被隐藏了 → 跳到第一个还显示着的页
    if (!tabShown(this.tab)) return this.showTab(this.tab);
    for (const b of this.el.tabs.children) b.hidden = !tabShown(b.dataset.tab);
    TABS.find(t => t.id === this.tab).mod.refresh();
    this.renderBanner();
  },
  renderBanner(){
    const B = Backup, kids = [];
    if (B.perm === 'prompt'){
      kids.push(h('span', null, '自动备份需要重新授权'), h('button.btn.small', { onclick: () => B.reconnect() }, '重新连接'));
    } else if (B.overdue()){
      const days = Math.floor((Date.now() - (B.info.lastAt || Store.data.meta.createdAt)) / 864e5);
      kids.push(h('span', null, B.info.lastAt ? `已经 ${days} 天没备份了` : '还没有备份过'),
        h('button.btn.small', { onclick: () => B.exportFile() }, '导出'),
        B.supported ? h('button.btn.small.ghost', { onclick: () => this.showTab('set') }, '设置自动备份') : null);
    }
    this.el.banner.replaceChildren(...kids.filter(Boolean));
    this.el.banner.hidden = !kids.length;
  },

  /* ---------- 面板开合 / 放大 + 场景让位 ----------
     三种样子：面板 + 场景（平时）；收起面板 = 场景放大铺满窗口；面板放大 = 面板铺满窗口、场景藏在后面 */
  setOpen(open){
    this.open = open; ui.open = open;
    if (!open) this.max = ui.max = false;   // 收起面板就是要看场景；再打开时是平常大小
    saveUi();
    document.body.classList.toggle('panel-closed', !open);
    this.layout();
  },
  setMax(max){
    this.max = max; ui.max = max; saveUi();
    this.layout();
  },
  layout(){
    const body = document.body, narrow = innerWidth < NARROW, immersive = body.classList.contains('immersive');
    const max = this.open && this.max && !narrow;
    body.classList.toggle('narrow', narrow);
    body.classList.toggle('panel-max', max);
    this.el.maxBtn.title = max ? '恢复面板大小' : '放大面板（铺满窗口）';
    this.el.maxBtn.innerHTML = max ? MAX_ICON.off : MAX_ICON.on;
    setSceneInset(this.open && !narrow && !immersive ? PANEL_W + PANEL_GAP * 2 : 0);
    const mode = immersive ? 'immersive' : !this.open ? 'big' : (max || narrow) ? 'hidden' : 'split';
    if (mode === 'hidden') Room.clearKeys();
    setSceneMode(mode);
    wake();
  },
  immersive(on){
    document.body.classList.toggle('immersive', on);
    this.layout();
    Pomo.paint();
  },
  timerBadge(txt){ if (this.el.opener) this.el.opener.querySelector('.op-timer').textContent = txt; },

  /* 面板配色跟着水色走：淡彩 / 深一阶 / 亮部 */
  themeVars(){
    const s = document.documentElement.style, P = THEMES[themeIdx];
    s.setProperty('--wash', `rgb(${P.W})`);
    s.setProperty('--wash-dk', `rgb(${P.DK})`);
    s.setProperty('--wash-lt', `rgb(${P.LT})`);
  },
};

/* 场景左上角的放大按钮：收起面板、场景铺满窗口；再点一下，面板回来 */
function toggleSceneBig(){ App.setOpen(!App.open); }

/* 门口的控制面板（点它，或者 rabbit 在旁边按 E）：打开面板，跳到设置 */
function openSettings(){
  if (document.body.classList.contains('immersive')) App.immersive(false);
  App.showTab('set');
}

/* 画布上换了颜色 / 静音（点色板、小喇叭，或按 M）→ 记下来 */
function onSceneChange(){
  App.themeVars();
  if (!Store.data) return;
  const s = Store.data.settings;
  if (s.theme === themeIdx && s.muted === muted) return;
  Store.update(d => { d.settings.theme = themeIdx; d.settings.muted = muted; });
}
/* 导入 / 恢复了一份备份之后：把颜色和静音也调成备份里的设置 */
function onDataReplaced(){
  const s = Store.data.settings;
  setThemeNow(s.theme);
  setMuted(s.muted);
  App.themeVars();
  Pomo.refresh();
  SoundDesk.applyAll();   // 备份里开着的环境声
}

/* ---------- 启动 ---------- */
(async function boot(){
  try {
    await Store.load();
  } catch (err){
    document.body.append(h('div.fatal', null, '无法打开本机数据库：' + (err && err.message || err) + '。请确认没有在无痕模式下打开。'));
    return;
  }
  const s = Store.data.settings;
  setThemeNow(s.theme); muted = s.muted;
  App.themeVars();
  const wasOpen = App.open;
  App.build();
  // 面板一出现就要能响应改动：先订阅，再做其余可能要等的初始化
  Store.subscribe((local, quiet) => {
    if (quiet) App.renderBanner(); else App.render();
    if (local) Backup.schedule();
  });
  Backup.subscribe(() => { App.renderBanner(); if (App.tab === 'set') Settings.refresh(); });
  await Backup.init();
  await Pomo.init();
  Tasks.rollover();          // 前几天没做完的任务挪到今天
  Reminders.start();         // 到点提醒（schedule.js）
  App.showTab(App.tab);
  App.setOpen(wasOpen);    // showTab 会顺手打开面板；还原成上次的开合状态
  // 跨过午夜：「今天」要换一天，没做完的任务也跟着挪到新的今天
  let lastDay = dayKey();
  setInterval(() => { if (dayKey() !== lastDay){ lastDay = dayKey(); Tasks.rollover(); App.render(); } }, 60e3);

  // 离线可用：只在 http(s) 下注册（直接双击打开的 file:// 不支持）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
