"use strict";
/* ============================================================
   app/tasks.js：任务 —— 最上面是「今天至少完成」，下面是清单 / 今天 / 全部，添加、完成、编辑、搜索
   标题开头或结尾写「今天 / 明天 / 后天 / 周三 / 下周一」会自动设成截止日期
   ------------------------------------------------------------
   今天至少完成：每天挑几件一定要做完的事（默认 3 件，可以 2–4 件，settings.mustN）。
   它们就是普通任务，钉在最上面（task.top = 钉上的时间）：没做完的第二天还在，做完的只在完成那天显示。
   钉在上面的任务不再出现在下面的清单里（搜索时除外）
   ============================================================ */

/* 解析标题首尾的口语日期 → { title, due } */
function parseQuickDue(raw){
  const re = /^(今天|明天|后天|大后天|下?周[一二三四五六日天])\s*|\s*(今天|明天|后天|大后天|下?周[一二三四五六日天])$/;
  const m = raw.match(re);
  if (!m) return { title: raw.trim(), due: null };
  const word = m[1] || m[2], today = dayKey();
  let due;
  const off = { '今天': 0, '明天': 1, '后天': 2, '大后天': 3 }[word];
  if (off != null) due = addDays(today, off);
  else {
    const idx = '一二三四五六日'.indexOf(word.slice(-1) === '天' ? '日' : word.slice(-1)); // 周一=0 … 周日=6
    const dow = (keyToDate(today).getDay() + 6) % 7;                                    // 今天是本周第几天（周一=0）
    let d = addDays(today, idx - dow);
    if (word.startsWith('下')) d = addDays(d, 7);
    else if (d < today) d = addDays(d, 7);
    due = d;
  }
  const title = raw.replace(re, '').trim();
  return title ? { title, due } : { title: raw.trim(), due: null };
}

/* 轻重（四象限）：任务的 quad 字段取 1–4，没有就是未分类。颜色取自水体主题 */
const QUADS = {
  1: { act: '马上做', name: '重要 · 紧急',   theme: 4 },
  2: { act: '排时间', name: '重要 · 不紧急', theme: 2 },
  3: { act: '顺手做', name: '紧急 · 不重要', theme: 6 },
  4: { act: '放一放', name: '不重要 · 不紧急', theme: 5 },
};
const quadVars = q => ({ '--qc': rgb(THEMES[QUADS[q].theme].W), '--qk': rgb(THEMES[QUADS[q].theme].DK) });
const MUST_MIN = 2, MUST_MAX = 4;

const Tasks = {
  view: 'today',     // 'today' | 'all' | 清单 id
  query: '',
  openId: null,
  showDone: false,
  el: {},

  mount(root){
    const e = this.el;
    e.must = h('div.must');
    e.mustInput = h('input.must-add', { placeholder: '写一件今天一定要做完的事，回车', maxLength: 200,
      onkeydown: ev => { if (ev.key === 'Enter' && !ev.isComposing) this._addMust(); } });
    e.chips = h('div.chips');
    e.listTools = h('div.list-tools');
    e.input = h('input.add-input', { placeholder: '添加任务（可写「明天」「周五」）', maxLength: 200,
      oninput: () => this._hint(), onkeydown: ev => { if (ev.key === 'Enter' && !ev.isComposing) this._add(); } });
    e.date = h('input.add-date', { type: 'date', title: '截止日期（可不填）' });
    e.hint = h('div.add-hint');
    e.search = h('input.search', { type: 'search', placeholder: '搜索任务', oninput: ev => { this.query = ev.target.value.trim(); this.renderList(); } });
    e.list = h('div.task-list');
    // 面板放大时：清单在左边一栏、任务在右边（css：body.panel-max .task-cols）
    root.append(
      e.must,
      h('div.task-cols', null,
        h('div.task-side', null, e.chips, e.listTools),
        h('div.task-main', null,
          h('div.add-row', null, e.input, e.date), e.hint,
          e.list,
          h('div.search-row', null, e.search))),
    );
  },
  refresh(){ this.renderMust(); this.renderChips(); this.renderList(); },

  _lists(){ return Store.data.lists; },
  _hint(){
    const q = parseQuickDue(this.el.input.value);
    this.el.hint.textContent = q.due && this.el.input.value.trim() ? `截止：${dueLabel(q.due)}（${q.due}）` : '';
  },
  _add(){
    const raw = this.el.input.value;
    if (!raw.trim()) return;
    const q = parseQuickDue(raw);
    const due = this.el.date.value || q.due || (this.view === 'today' ? dayKey() : null);
    const listId = this._lists().some(l => l.id === this.view) ? this.view : 'inbox';
    Store.update(d => d.tasks.push({ id: uid(), listId, title: q.title, notes: '', due, done: false, doneAt: 0, createdAt: Date.now() }));
    this.el.input.value = ''; this.el.date.value = ''; this._hint();
  },

  /* ---------- 今天至少完成 ---------- */
  _mustN(){ return clamp(Store.data.settings.mustN || 3, MUST_MIN, MUST_MAX); },
  /* 钉在上面的任务：没做完的一直在；做完的只留到完成那天 */
  _must(){
    const today = dayKey();
    return Store.data.tasks.filter(t => t.top && (!t.done || dayKey(new Date(t.doneAt)) === today)).sort((a, b) => a.top - b.top);
  },
  _mustDone(){ return this._must().filter(t => t.done).length; },
  renderMust(){
    const items = this._must(), n = this._mustN(), done = items.filter(t => t.done).length;
    const inp = this.el.mustInput, focused = document.activeElement === inp;   // 重画会让输入框失焦，画完再还回去
    const setN = v => Store.update(d => { d.settings.mustN = v; });
    const full = items.length >= n;
    const rows = [];
    items.forEach((t, i) => rows.push(...this._row(t, i + 1)));
    for (let i = items.length; i < n; i++)
      rows.push(h('div.must-row.empty', null, h('span.must-i', null, i + 1), i === items.length ? inp : h('span.must-blank')));
    this.el.must.replaceChildren(
      h('div.must-head', null,
        h('span.must-title', null, '今天至少完成'),
        h('button.must-step', { title: full ? '格子都填上了：先移出一件，才能减少' : '少一件', disabled: n <= MUST_MIN || full, onclick: () => setN(n - 1) }, '−'),
        h('b.must-n', null, n),
        h('button.must-step', { title: '多一件', disabled: n >= MUST_MAX, onclick: () => setN(n + 1) }, '+'),
        h('span.must-title', null, '件'),
        h('span.must-prog' + (done >= n ? '.ok' : ''), null, done >= n ? `${done} / ${n} · 做到了` : `${done} / ${n}`)),
      ...rows);
    if (focused && !full) inp.focus();
  },
  _addMust(){
    const raw = this.el.mustInput.value;
    if (!raw.trim() || this._must().length >= this._mustN()) return;
    const q = parseQuickDue(raw), now = Date.now();
    this.el.mustInput.value = '';
    Store.update(d => d.tasks.push({ id: uid(), listId: 'inbox', title: q.title, notes: '', due: q.due || dayKey(), done: false, doneAt: 0, createdAt: now, top: now }));
  },
  /* 设为 / 移出「今天至少完成」（移出后任务还在下面的清单里） */
  setMust(id, on){
    const n = this._mustN();
    if (on && this._must().length >= n) return toast(`今天的 ${n} 件已经排满了：先移出一件，或者点 + 多加一件。`);
    Store.update(d => { const t = d.tasks.find(x => x.id === id); if (t) t.top = on ? Date.now() : 0; });
  },

  /* ---------- 视图切换：今天 / 全部 / 各清单 ---------- */
  renderChips(){
    const d = Store.data, today = dayKey(), must = new Set(this._must().map(t => t.id));
    const undone = d.tasks.filter(t => !t.done && !must.has(t.id));   // 和下面的清单一样：不算钉在上面的
    const chip = (id, label, n) => h('button.chip' + (this.view === id ? '.on' : ''),
      { onclick: () => { this.view = id; this.openId = null; this.refresh(); } }, label, n ? h('span.n', null, n) : null);
    this.el.chips.replaceChildren(
      chip('today', '今天', undone.filter(t => t.due && t.due <= today).length),
      chip('all', '全部', undone.length),
      ...d.lists.map(l => chip(l.id, l.name, undone.filter(t => t.listId === l.id).length)),
      h('button.chip.add', { title: '新建清单', onclick: () => {
        const name = (prompt('新清单的名字') || '').trim();
        if (!name) return;
        const id = uid();
        Store.update(dd => dd.lists.push({ id, name, createdAt: Date.now() }));
        this.view = id; this.refresh();
      } }, '＋ 清单'),
    );
    // 自建清单：可改名 / 删除（任务挪回收件箱）
    const cur = d.lists.find(l => l.id === this.view && l.id !== 'inbox');
    this.el.listTools.replaceChildren(...(cur ? [
      h('button.link', { onclick: () => {
        const name = (prompt('清单改名为', cur.name) || '').trim();
        if (name) Store.update(dd => { dd.lists.find(l => l.id === cur.id).name = name; });
      } }, '改名'),
      h('button.link', { onclick: () => {
        if (!confirm(`删除清单「${cur.name}」？里面的任务会挪到收件箱。`)) return;
        Store.update(dd => {
          dd.lists = dd.lists.filter(l => l.id !== cur.id);
          for (const t of dd.tasks) if (t.listId === cur.id) t.listId = 'inbox';
        });
        this.view = 'inbox'; this.refresh();
      } }, '删除清单'),
    ] : []));
  },

  /* ---------- 任务列表 ---------- */
  _visible(){
    const d = Store.data, today = dayKey(), q = this.query.toLowerCase();
    const must = new Set(q ? [] : this._must().map(t => t.id));   // 已经在最上面「今天至少完成」里的不再列（搜索时都列）
    let ts = d.tasks.filter(t => !must.has(t.id));
    if (q) ts = ts.filter(t => (t.title + ' ' + t.notes).toLowerCase().includes(q));
    else if (this.view === 'today') ts = ts.filter(t => t.done ? dayKey(new Date(t.doneAt)) === today : (t.due && t.due <= today));
    else if (this.view !== 'all') ts = ts.filter(t => t.listId === this.view);
    const undone = ts.filter(t => !t.done).sort((a, b) =>
      (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : a.createdAt - b.createdAt);
    const done = ts.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
    return { undone, done };
  },
  renderList(){
    const { undone, done } = this._visible();
    const kids = [];
    if (this.query) kids.push(h('div.muted.small', null, `搜索「${this.query}」：${undone.length + done.length} 个结果`));
    if (!undone.length && !this.query) kids.push(h('div.empty', null, this.view !== 'today' ? '这里还空着。'
      : this._must().some(t => !t.done) ? '别的事都清空了。' : '今天没有要做的事。听听雨吧。'));
    for (const t of undone) kids.push(...this._row(t));
    if (done.length){
      kids.push(h('button.done-toggle', { onclick: () => { this.showDone = !this.showDone; this.renderList(); } },
        (this.showDone ? '▾ ' : '▸ ') + `已完成 ${done.length}`));
      if (this.showDone || this.query) for (const t of done.slice(0, 200)) kids.push(...this._row(t));
    }
    this.el.list.replaceChildren(...kids);
  },
  /* 一行任务；slot = 在「今天至少完成」里的第几件（前面多一个序号，后面多一个移出的 ×） */
  _row(t, slot){
    const today = dayKey(), d = Store.data;
    const list = d.lists.find(l => l.id === t.listId);
    const pomos = d.pomos.filter(p => p.taskId === t.id).length;
    const open = this.openId === t.id;
    const row = h((slot ? 'div.must-row' : 'div.task') + (t.done ? '.done' : '') + (open ? '.open' : ''), null,
      slot ? h('span.must-i', null, slot) : null,
      checkBox(t.done, () => this.toggleDone(t.id)),
      h('div.t-main', { onclick: () => { this.openId = open ? null : t.id; this.renderMust(); this.renderList(); } },
        h('div.t-title', null, t.title),
        h('div.t-meta', null,
          t.due ? h('span' + (!t.done && t.due < today ? '.overdue' : ''), null, dueLabel(t.due)) : null,
          (slot || this.view === 'today' || this.view === 'all' || this.query) && list && list.id !== 'inbox' ? h('span', null, list.name) : null,
          t.notes ? h('span', null, '有备注') : null,
          pomos ? h('span.pomo-n', null, `番茄 ×${pomos}`) : null,
          QUADS[t.quad] ? h('span.qtag', { style: quadVars(t.quad), title: QUADS[t.quad].name }, QUADS[t.quad].act) : null,
        ),
      ),
      slot && !t.done ? h('button.must-x', { title: '移出（任务还在下面的清单里）', onclick: () => this.setMust(t.id, false) }, '×') : null,
    );
    return open ? [row, this._detail(t)] : [row];
  },
  _detail(t){
    const set = (k, v) => Store.update(d => { const x = d.tasks.find(y => y.id === t.id); if (x) x[k] = v; }, true);  // 安静保存，收起时再刷新
    return h('div.t-detail', null,
      h('input.t-edit-title', { value: t.title, maxLength: 200, onchange: e => { const v = e.target.value.trim(); if (v) set('title', v); } }),
      h('textarea.t-notes', { value: t.notes, placeholder: '备注', rows: 3, onchange: e => set('notes', e.target.value) }),
      h('div.t-fields', null,
        h('label', null, '截止 ', h('input', { type: 'date', value: t.due || '', onchange: e => set('due', e.target.value || null) })),
        h('label', null, '清单 ', h('select', { onchange: e => set('listId', e.target.value) },
          ...Store.data.lists.map(l => h('option', { value: l.id, selected: l.id === t.listId }, l.name)))),
        h('label', null, '轻重 ', h('select', { onchange: e => set('quad', +e.target.value || null) },
          h('option', { value: '' }, '未分类'),
          ...Object.entries(QUADS).map(([q, x]) => h('option', { value: q, selected: +q === t.quad }, `${x.act}（${x.name}）`)))),
      ),
      h('div.t-actions', null,
        t.done ? null : h('button.btn', { onclick: () => { Pomo.setTask(t.id); App.showTab('pomo'); } }, '开始专注'),
        t.done ? null : h('button.btn', { onclick: () => this.setMust(t.id, !t.top) }, t.top ? '移出今天必做' : '设为今天必做'),
        h('button.btn.ghost', { onclick: () => {
          if (!confirm(`删除「${t.title}」？`)) return;
          Store.update(d => { d.tasks = d.tasks.filter(x => x.id !== t.id); });
          this.openId = null;
        } }, '删除'),
      ),
    );
  },
  toggleDone(id){
    let nowDone = false;
    const n = this._mustN(), before = this._mustDone();
    Store.update(d => {
      const t = d.tasks.find(x => x.id === id);
      if (!t) return;
      t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; nowDone = t.done;
    });
    if (!nowDone) return;
    celebrate();   // 完成一件事：rabbit 拍手
    if (before < n && this._mustDone() >= n) toast(`今天至少完成的 ${n} 件事，都做到了！`);
  },
};

/* 像素勾选框：勾是 7×7 的像素图（每列一个 1×2 的小方块），勾上时弹出来 */
const CHECK_SVG = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges">' +
  [3, 4, 5, 4, 3, 2, 1].map((y, x) => `<rect x="${x}" y="${y}" width="1" height="2"/>`).join('') + '</svg>';
function checkBox(on, onclick, label){
  const b = h('button.check' + (on ? '.on' : ''), { onclick: e => { e.stopPropagation(); onclick(); }, 'aria-pressed': on ? 'true' : 'false', 'aria-label': label || '完成' });
  b.innerHTML = CHECK_SVG;
  return b;
}
