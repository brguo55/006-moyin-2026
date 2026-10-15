"use strict";
/* ============================================================
   app/tasks.js：任务 —— 最上面是「今天至少完成」，下面是清单 / 今天 / 全部，添加、完成、编辑、搜索
   标题开头或结尾写「今天 / 明天 / 后天 / 周三 / 下周一」会自动设成截止日期，写「15:00」「下午3点」会设成时间
   时间、提醒、重复的规则在 schedule.js；子任务：task.subs = [{ id, title, done }]
   过了午夜（或者隔几天才打开），没做完、日期已经过去的任务自动挪到今天，不留在过去的日期上
   ------------------------------------------------------------
   今天至少完成：每天挑几件一定要做完的事（默认 3 件，可以 2–4 件，settings.mustN）。
   它们就是普通任务，钉在最上面（task.top = 钉上的时间）：没做完的第二天还在，做完的只在完成那天显示。
   钉在上面的任务不再出现在下面的清单里（搜索时除外）
   标签：任务详情里加（task.tags），显示在任务标题下面，搜索能搜到（写不写 # 都行）
   自己建的清单可以拖动排顺序；今天 / 全部 / 收件箱固定在最前面
   ============================================================ */

/* 解析标题首尾的口语日期和时间 → { title, due, time }
   日期：今天 / 今晚 / 明天 / 后天 / 大后天 / 周三 / 下周一；时间：15:00、下午3点、3点半、晚上8点15
   可以连着写（明天下午3点 开会 / 开会 周五 15:00）；只写了时间就算今天
   「15:00」这种前后要有空格（「比例2:1」不算）；「3点」前面是「第」或数字的也不算（「复习第3点」） */
const QD_DATE = '今天|今晚|明天|后天|大后天|下?周[一二三四五六日天]';
const QD_TIME_CN = '(上午|早上|中午|下午|晚上)?(\\d{1,2})点(半|(\\d{1,2})分?)?';
const QD_TIME_NUM = '(\\d{1,2})[:：](\\d{2})';
const QD_RE = {
  dateHead: new RegExp(`^(${QD_DATE})\\s*`), dateTail: new RegExp(`\\s*(${QD_DATE})$`),
  cnHead: new RegExp(`^${QD_TIME_CN}\\s*`), cnTail: new RegExp(`${QD_TIME_CN}$`),
  numHead: new RegExp(`^${QD_TIME_NUM}(?:\\s+|$)`), numTail: new RegExp(`(?:^|\\s)${QD_TIME_NUM}$`),
};
function parseQuickDue(raw){
  const today = dayKey();
  let s = raw.trim(), due = null, time = null, night = false;
  const cut = m => { s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim(); };
  const dateOf = word => {
    const off = { '今天': 0, '今晚': 0, '明天': 1, '后天': 2, '大后天': 3 }[word];
    if (off != null) return addDays(today, off);
    const idx = '一二三四五六日'.indexOf(word.slice(-1) === '天' ? '日' : word.slice(-1)); // 周一=0 … 周日=6
    const dow = (keyToDate(today).getDay() + 6) % 7;                                    // 今天是本周第几天（周一=0）
    let d = addDays(today, idx - dow);
    if (word.startsWith('下')) d = addDays(d, 7);
    else if (d < today) d = addDays(d, 7);
    return d;
  };
  const timeOf = (period, hh, mm) => {
    let h = +hh;
    const m = +mm || 0;
    if ((period === '下午' || period === '晚上' || (!period && night)) && h < 12) h += 12;
    else if (period === '中午' && h < 11) h += 12;
    return h <= 23 && m <= 59 ? `${pad2(h)}:${pad2(m)}` : null;
  };
  for (let i = 0; i < 4; i++){
    let m;
    if (!due && ((m = s.match(QD_RE.dateHead)) || (m = s.match(QD_RE.dateTail)))){
      due = dateOf(m[1]); night = night || m[1] === '今晚'; cut(m); continue;
    }
    if (!time && ((m = s.match(QD_RE.cnHead)) || ((m = s.match(QD_RE.cnTail)) && !/[第\d]/.test(s[m.index - 1] || '')))){
      const tm = timeOf(m[1], m[2], m[3] === '半' ? 30 : m[4]);
      if (tm){ time = tm; cut(m); continue; }
    }
    if (!time && ((m = s.match(QD_RE.numHead)) || (m = s.match(QD_RE.numTail)))){
      const tm = timeOf(null, m[1], m[2]);
      if (tm){ time = tm; cut(m); continue; }
    }
    break;
  }
  if (!s) return { title: raw.trim(), due: null, time: null };   // 只有日期 / 时间、没有内容：整句当标题
  return { title: s, due: due || (time ? today : null), time };
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
const LIST_PAGE = 200;   // 一次最多画这么多个没做完的任务（从滴答清单搬来几千个时，不用每次都全画）；后面的点「再显示」

const Tasks = {
  view: 'today',     // 'today' | 'all' | 清单 id
  query: '',
  openId: null,
  showDone: false,
  pages: 1,          // 没做完的任务画了几批（换清单、换搜索时回到 1）
  el: {},
  _pomoN: new Map(),   // 任务 id → 做了几个番茄（_countPomos）

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
    e.search = h('input.search', { type: 'search', placeholder: '搜索任务', oninput: ev => { this.query = ev.target.value.trim(); this.pages = 1; this.renderList(); } });
    e.list = h('div.task-list');
    e.tagOptions = h('datalist#tag-options');   // 标签输入框的提示：用过的标签
    // 面板放大时：清单在左边一栏、任务在右边（css：body.panel-max .task-cols）
    root.append(
      e.must,
      h('div.task-cols', null,
        h('div.task-side', null, e.chips, e.listTools),
        h('div.task-main', null,
          h('div.add-row', null, e.input, e.date), e.hint,
          e.list,
          h('div.search-row', null, e.search))),
      e.tagOptions,
    );
  },
  refresh(){ this.renderMust(); this.renderChips(); this.renderList(); },

  /* 每个任务做了几个番茄：画一次列表数一遍（不要每一行都把全部番茄记录翻一遍） */
  _countPomos(){
    const n = new Map();
    for (const p of Store.data.pomos) if (p.taskId) n.set(p.taskId, (n.get(p.taskId) || 0) + 1);
    this._pomoN = n;
  },
  _hint(){
    const q = parseQuickDue(this.el.input.value);
    this.el.hint.textContent = q.due && this.el.input.value.trim() ? `截止：${dueText(q)}（${q.due}）` : '';
  },
  _add(){
    const raw = this.el.input.value;
    if (!raw.trim()) return;
    const q = parseQuickDue(raw);
    const due = this.el.date.value || q.due || (this.view === 'today' ? dayKey() : null);
    const listId = Store.data.lists.some(l => l.id === this.view) ? this.view : 'inbox';
    const time = due ? q.time : null;
    if (time) Reminders.askPermission();
    Store.update(d => d.tasks.push({ id: uid(), listId, title: q.title, notes: '', due, time, remind: time ? 0 : null, done: false, doneAt: 0, createdAt: Date.now() }));
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
    this._countPomos();
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
    if (q.time) Reminders.askPermission();
    Store.update(d => d.tasks.push({ id: uid(), listId: 'inbox', title: q.title, notes: '', due: q.due || dayKey(), time: q.time, remind: q.time ? 0 : null,
      done: false, doneAt: 0, createdAt: now, top: now }));
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
    if (this.view !== 'today' && this.view !== 'all' && !d.lists.some(l => l.id === this.view)) this.view = 'inbox';   // 清单被删了（比如撤销导入）
    const undone = d.tasks.filter(t => !t.done && !must.has(t.id));   // 和下面的清单一样：不算钉在上面的
    const chip = (id, label, n) => h('button.chip' + (this.view === id ? '.on' : ''),
      { onclick: () => { this.view = id; this.openId = null; this.pages = 1; this.refresh(); } }, label, n ? h('span.n', null, n) : null);
    this.el.chips.replaceChildren(
      chip('today', '今天', undone.filter(t => t.due && t.due <= today).length),
      chip('all', '全部', undone.length),
      ...d.lists.map(l => {
        const c = chip(l.id, l.name, undone.filter(t => t.listId === l.id).length);
        return l.id === 'inbox' ? c : this._draggable(c, l.id);
      }),
      h('button.chip.add', { title: '新建清单', onclick: async () => {
        const name = await ask({ title: '新清单', input: true, placeholder: '清单的名字，比如「工作」', ok: '新建' });
        if (!name) return;
        const id = uid();
        Store.update(dd => dd.lists.push({ id, name, createdAt: Date.now() }));
        this.view = id; this.pages = 1; this.refresh();
      } }, '＋ 清单'),
    );
    // 自建清单：可改名 / 删除（任务挪回收件箱）
    const cur = d.lists.find(l => l.id === this.view && l.id !== 'inbox');
    this.el.listTools.replaceChildren(...(cur ? [
      h('button.link', { onclick: async () => {
        const name = await ask({ title: '清单改名', input: true, value: cur.name, ok: '改名' });
        if (name) Store.update(dd => { const l = dd.lists.find(x => x.id === cur.id); if (l) l.name = name; });
      } }, '改名'),
      h('button.link', { onclick: async () => {
        if (!await ask({ title: '删除清单', text: `删除清单「${cur.name}」？里面的任务会挪到收件箱。`, ok: '删除', danger: true })) return;
        Store.update(dd => {
          dd.lists = dd.lists.filter(l => l.id !== cur.id);
          for (const t of dd.tasks) if (t.listId === cur.id) t.listId = 'inbox';
        });
        this.view = 'inbox'; this.pages = 1; this.refresh();
      } }, '删除清单'),
    ] : []));
  },

  /* 自己建的清单拖动排顺序：放在另一个清单的前面或后面（横着排看左右，面板放大时竖着排看上下） */
  _draggable(el, id){
    const MIME = 'text/x-tingyu-list';
    const side = e => {
      const r = el.getBoundingClientRect(), col = getComputedStyle(this.el.chips).flexDirection === 'column';
      return (col ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2) ? 'before' : 'after';
    };
    const clear = () => el.classList.remove('drop-before', 'drop-after');
    el.draggable = true;
    el.title = '拖动可以调整顺序';
    el.addEventListener('dragstart', e => { e.dataTransfer.setData(MIME, id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => {
      if (!e.dataTransfer.types.includes(MIME)) return;   // 只接清单（今天 / 全部 / 收件箱不接）
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const s = side(e);
      el.classList.toggle('drop-before', s === 'before'); el.classList.toggle('drop-after', s === 'after');
    });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) clear(); });
    el.addEventListener('drop', e => {
      e.preventDefault(); clear();
      const from = e.dataTransfer.getData(MIME);
      if (from && from !== id) this.moveList(from, id, side(e));
    });
    return el;
  },
  moveList(from, to, where){
    Store.update(d => {
      const i = d.lists.findIndex(l => l.id === from);
      if (i < 0) return;
      const [l] = d.lists.splice(i, 1);
      const j = d.lists.findIndex(x => x.id === to);
      if (j < 0) d.lists.push(l); else d.lists.splice(j + (where === 'after' ? 1 : 0), 0, l);
    });
  },

  /* ---------- 任务列表 ---------- */
  _visible(){
    const d = Store.data, today = dayKey(), q = this.query.toLowerCase();
    const must = new Set(q ? [] : this._must().map(t => t.id));   // 已经在最上面「今天至少完成」里的不再列（搜索时都列）
    let ts = d.tasks.filter(t => !must.has(t.id));
    if (q) ts = ts.filter(t => [t.title, t.notes, ...(t.tags || []).map(g => '#' + g)].join(' ').toLowerCase().includes(q));
    else if (this.view === 'today') ts = ts.filter(t => t.done ? dayKey(new Date(t.doneAt)) === today : (t.due && t.due <= today));
    else if (this.view !== 'all') ts = ts.filter(t => t.listId === this.view);
    const key = t => (t.due || '9999') + ' ' + (t.time || '99:99');   // 先按日期，同一天有时间的按时间排在前面
    const undone = ts.filter(t => !t.done).sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.createdAt - b.createdAt);
    const done = ts.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
    return { undone, done };
  },
  renderList(){
    const { undone, done } = this._visible();
    const kids = [];
    this._countPomos();
    if (this.query) kids.push(h('div.muted.small', null, `搜索「${this.query}」：${undone.length + done.length} 个结果`));
    if (!undone.length && !this.query) kids.push(h('div.empty', null, this.view !== 'today' ? '这里还空着。'
      : this._must().some(t => !t.done) ? '别的事都清空了。' : '今天没有要做的事。听听雨吧。'));
    const cap = LIST_PAGE * this.pages;
    for (const t of undone.slice(0, cap)) kids.push(...this._row(t));
    if (undone.length > cap) kids.push(h('button.done-toggle.list-more', { onclick: () => { this.pages++; this.renderList(); } },
      `▸ 还有 ${undone.length - cap} 个 · 再显示 ${Math.min(LIST_PAGE, undone.length - cap)} 个`));
    if (done.length){
      kids.push(h('button.done-toggle', { onclick: () => { this.showDone = !this.showDone; this.renderList(); } },
        (this.showDone ? '▾ ' : '▸ ') + `已完成 ${done.length}`));
      if (this.showDone || this.query) for (const t of done.slice(0, 200)) kids.push(...this._row(t));
    }
    this.el.list.replaceChildren(...kids);
  },
  /* 一行任务；slot = 在「今天至少完成」里的第几件（前面多一个序号，后面多一个移出的 ×） */
  _row(t, slot){
    const d = Store.data;
    const list = d.lists.find(l => l.id === t.listId);
    const pomos = this._pomoN.get(t.id) || 0;
    const open = this.openId === t.id;
    const row = h((slot ? 'div.must-row' : 'div.task') + (t.done ? '.done' : '') + (open ? '.open' : ''), null,
      slot ? h('span.must-i', null, slot) : null,
      checkBox(t.done, () => this.toggleDone(t.id)),
      h('div.t-main', { onclick: () => { this.openId = open ? null : t.id; this.renderMust(); this.renderList(); } },
        h('div.t-title', null, t.title),
        h('div.t-meta', null,
          t.due ? h('span' + (isLate(t) ? '.overdue' : ''), null, dueText(t)) : null,
          t.repeat && !t.done ? h('span.rep', null, repeatLabel(t.repeat)) : null,
          (slot || this.view === 'today' || this.view === 'all' || this.query) && list && list.id !== 'inbox' ? h('span', null, list.name) : null,
          ...(t.tags || []).map(g => h('span.tag', null, '#' + g)),
          t.subs && t.subs.length ? h('span', null, `子任务 ${t.subs.filter(x => x.done).length}/${t.subs.length}`) : null,
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
      this._subEdit(t),
      h('div.t-fields', null,
        this._whenFields(t),
        h('label', null, '清单 ', h('select', { onchange: e => set('listId', e.target.value) },
          ...Store.data.lists.map(l => h('option', { value: l.id, selected: l.id === t.listId }, l.name)))),
        h('div.tag-field', null, '标签 ', this._tagEdit(t)),   // 不用 label：点「标签」两个字会误点到 × 按钮
        h('label', null, '轻重 ', h('select', { onchange: e => set('quad', +e.target.value || null) },
          h('option', { value: '' }, '未分类'),
          ...Object.entries(QUADS).map(([q, x]) => h('option', { value: q, selected: +q === t.quad }, `${x.act}（${x.name}）`)))),
      ),
      h('div.t-actions', null,
        t.done ? null : h('button.btn', { onclick: () => { Pomo.setTask(t.id); App.showTab('pomo'); } }, '开始专注'),
        t.done ? null : h('button.btn', { onclick: () => this.setMust(t.id, !t.top) }, t.top ? '移出今天必做' : '设为今天必做'),
        h('button.btn.ghost', { onclick: async () => {
          if (!await ask({ title: '删除任务', text: `删除「${t.title}」？`, ok: '删除', danger: true })) return;
          Store.update(d => { d.tasks = d.tasks.filter(x => x.id !== t.id); });
          this.openId = null;
        } }, '删除'),
      ),
    );
  },
  /* 新的一天：没做完、日期已经过去的任务挪到今天（打开时和过午夜时各做一次） */
  rollover(){
    const today = dayKey(), late = t => !t.done && t.due && t.due < today;
    if (Store.data.tasks.some(late)) Store.update(d => { for (const t of d.tasks) if (late(t)){ t.due = today; Reminders.settle(t); } });
  },
  /* 截止日期 + 时间 + 提醒 + 重复：改了就安静保存，这一小块自己重画（display: contents，和后面的清单、标签排在一行里） */
  _whenFields(t){
    const box = h('span.when-fields');
    const cur = () => Store.data.tasks.find(y => y.id === t.id) || t;
    const put = fn => {
      Store.update(d => { const x = d.tasks.find(y => y.id === t.id); if (x){ fn(x); Reminders.settle(x); } }, true);
      draw();
    };
    const draw = () => {
      const x = cur();
      box.replaceChildren(...[
        h('label', null, '截止 ',
          h('input', { type: 'date', value: x.due || '', onchange: e => put(y => {
            y.due = e.target.value || null;
            if (!y.due){ y.time = null; y.remind = null; y.repeat = null; }                 // 没日期就没有时间和重复
            else if (y.repeat) y.repeat = makeRepeat(y.repeat.type, y.due, y.repeat);       // 每月几号 / 每年几月几号跟着新日期
          }) }),
          h('input.t-time', { type: 'time', value: x.time || '', title: '时间（可不填）', onchange: e => put(y => {
            y.time = e.target.value || null;
            if (!y.time){ y.remind = null; return; }
            if (!y.due) y.due = dayKey();
            if (y.remind == null) y.remind = 0;   // 设了时间默认准时提醒
            Reminders.askPermission();
          }) })),
        x.time ? h('label', null, '提醒 ', h('select', { onchange: e => put(y => { y.remind = e.target.value === '' ? null : +e.target.value; }) },
          ...REMIND_OPTS.map(([v, s]) => h('option', { value: v, selected: x.remind === v }, s)),
          h('option', { value: '', selected: x.remind == null }, '不提醒'))) : null,
        h('label', null, '重复 ', h('select', { onchange: e => put(y => {
          if (e.target.value && !y.due) y.due = dayKey();
          y.repeat = makeRepeat(e.target.value, y.due, y.repeat);
        }) }, ...REPEAT_OPTS.map(([v, s]) => h('option', { value: v, selected: (x.repeat ? x.repeat.type : '') === v }, s)))),
        x.repeat && x.repeat.type === 'week' ? h('span.week-pick', { title: '每周哪几天' }, ...WEEK_ORDER.map(wd =>
          h('button.wd' + (x.repeat.days.includes(wd) ? '.on' : ''), { onclick: () => put(y => {
            const ds = new Set(y.repeat.days);
            if (!ds.has(wd)) ds.add(wd); else if (ds.size > 1) ds.delete(wd);   // 至少留一天
            y.repeat = { ...y.repeat, days: [...ds] };
          }) }, WEEK[wd]))) : null,
      ].filter(Boolean));
    };
    draw();
    return box;
  },
  /* 子任务：打勾 / 改字 / ×；最后的输入框回车加一条。安静保存，收起时再刷新 */
  _subEdit(t){
    const subs = (t.subs || []).map(x => ({ ...x }));
    const save = () => Store.update(d => { const x = d.tasks.find(y => y.id === t.id); if (x) x.subs = subs.map(y => ({ ...y })); }, true);
    const box = h('div.subs');
    const input = h('input.sub-add', { placeholder: '＋ 子任务（回车添加）', maxLength: 200, onkeydown: e => {
      if (e.key !== 'Enter' || e.isComposing || !input.value.trim()) return;
      subs.push({ id: uid(), title: input.value.trim(), done: false });
      input.value = ''; save(); draw(true);
    } });
    const draw = refocus => {
      box.replaceChildren(...subs.map(x => h('div.sub' + (x.done ? '.done' : ''), null,
        checkBox(x.done, () => { x.done = !x.done; save(); draw(false); }, '完成子任务'),
        h('input.sub-title', { value: x.title, maxLength: 200, onchange: e => { const v = e.target.value.trim(); if (v){ x.title = v; save(); } } }),
        h('button.sub-x', { title: '删掉这条子任务', onclick: () => { subs.splice(subs.indexOf(x), 1); save(); draw(false); } }, '×'))), input);
      if (refocus) input.focus();
    };
    draw(false);
    return box;
  },
  /* 跳到某个任务（点了提醒的系统通知、轻重里点标题）：打开任务页、展开它 */
  reveal(id){
    if (!Store.data.tasks.some(x => x.id === id)) return;
    this.view = 'all'; this.query = ''; this.el.search.value = ''; this.openId = id;
    const i = this._visible().undone.findIndex(t => t.id === id);   // 排得很靠后的话，画到它那一批
    this.pages = i < 0 ? 1 : Math.floor(i / LIST_PAGE) + 1;
    App.showTab('tasks');
    const row = this.el.list.querySelector('.task.open') || this.el.must.querySelector('.must-row.open');
    if (row) row.scrollIntoView({ block: 'center' });
  },
  /* 标签编辑：已有的标签（× 去掉）+ 小输入框（回车或逗号加上；空着按退格删最后一个；会提示用过的标签）。安静保存，收起时再刷新 */
  _tagEdit(t){
    const tags = [...(t.tags || [])];
    const save = () => Store.update(d => { const x = d.tasks.find(y => y.id === t.id); if (x) x.tags = tags.slice(); }, true);
    const box = h('span.tag-edit');
    const input = h('input.tag-add', { placeholder: '＋ 标签', maxLength: 20, list: 'tag-options',
      onkeydown: e => {
        if (e.isComposing) return;
        if (e.key === 'Enter' || e.key === ',' || e.key === '，'){ e.preventDefault(); add(true); }
        else if (e.key === 'Backspace' && !input.value && tags.length){ tags.pop(); save(); draw(true); }
      },
      onchange: () => add(false) });   // 从提示里选了、或者写完点别处，也算加上
    const add = refocus => {
      const v = input.value.replace(/^[#＃\s]+/, '').trim();
      input.value = '';
      if (v && !tags.includes(v)){ tags.push(v); save(); }
      draw(refocus);
    };
    const draw = refocus => {
      box.replaceChildren(...tags.map(g => h('span.tag-chip', null, '#' + g,
        h('button', { title: '去掉这个标签', onclick: () => { tags.splice(tags.indexOf(g), 1); save(); draw(false); } }, '×'))), input);
      const all = [...new Set(Store.data.tasks.flatMap(x => x.tags || []))].filter(g => !tags.includes(g)).sort((a, b) => a.localeCompare(b, 'zh'));
      this.el.tagOptions.replaceChildren(...all.map(g => h('option', { value: g })));
      if (refocus) input.focus();
    };
    draw(false);
    return box;
  },
  /* 打勾 / 取消。重复的任务做完 → 照规则生成下一次（子任务都还原成没做）；
     刚做完又取消 → 刚才生成的下一次（还没做的话）收回去 */
  toggleDone(id){
    let nowDone = false, next = null;
    const n = this._mustN(), before = this._mustDone();
    Store.update(d => {
      const t = d.tasks.find(x => x.id === id);
      if (!t) return;
      t.done = !t.done; t.doneAt = t.done ? Date.now() : 0; nowDone = t.done;
      if (t.done && t.repeat && t.due){
        const due = nextDue(t.repeat, t.due);
        if (!due) return;
        next = { ...t, id: uid(), due, done: false, doneAt: 0, createdAt: Date.now(), top: 0, remindedAt: 0,
          subs: (t.subs || []).map(x => ({ ...x, id: uid(), done: false })) };
        delete next.nextId;
        d.tasks.push(next);
        t.nextId = next.id;
      } else if (!t.done && t.nextId){
        const i = d.tasks.findIndex(x => x.id === t.nextId && !x.done);
        if (i >= 0) d.tasks.splice(i, 1);
        delete t.nextId;
      }
    });
    if (!nowDone) return;
    celebrate();   // 完成一件事：rabbit 拍手
    if (before < n && this._mustDone() >= n) toast(`今天至少完成的 ${n} 件事，都做到了！`);
    else if (next) toast(`下一次：${dueText(next)}（${repeatLabel(next.repeat)}）`);
  },
};

/* 像素勾选框：勾是 7×7 的像素图（每列一个 1×2 的小方块），勾上时弹出来 */
const CHECK_SVG = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges"><path d="' +
  [3, 4, 5, 4, 3, 2, 1].map((y, x) => `M${x} ${y}h1v2h-1z`).join('') + '"/></svg>';
function checkBox(on, onclick, label){
  return h('button.check' + (on ? '.on' : ''), { onclick: e => { e.stopPropagation(); onclick(); }, 'aria-pressed': on ? 'true' : 'false', 'aria-label': label || '完成' },
    svgEl(CHECK_SVG));
}
