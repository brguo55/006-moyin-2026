"use strict";
/* ============================================================
   app/matrix.js：轻重（艾森豪威尔矩阵 / 四象限）
   按「重要」「紧急」把没做完的任务分进四格：马上做 / 排时间 / 顺手做 / 放一放。
   格子里能直接添加；拖动任务换格子；未分类的任务在下面，拖进格子即分类。
   任务的分类存在 task.quad（1–4），在「任务」页的详情里也能改。
   ============================================================ */

const Matrix = {
  el: {},
  showUnsorted: true,

  mount(root){
    this.el.grid = h('div.quad-grid');
    this.el.unsorted = h('div.unsorted');
    root.append(
      h('p.page-hint', null, '轻重缓急：把事情按「重要」和「紧急」分进四格。拖动任务可以换格子。'),
      this.el.grid, this.el.unsorted);
  },

  _undone(){ return Store.data.tasks.filter(t => !t.done); },
  _sorted(ts){ return ts.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt); },
  setQuad(id, q){
    Store.update(d => { const t = d.tasks.find(x => x.id === id); if (t) t.quad = q || null; });
  },

  refresh(){
    const undone = this._undone();
    this.el.grid.replaceChildren(...[1, 2, 3, 4].map(q => this._cell(q, this._sorted(undone.filter(t => t.quad === q)))));
    const rest = this._sorted(undone.filter(t => !QUADS[t.quad]));
    this.el.unsorted.replaceChildren(
      h('button.done-toggle', { onclick: () => { this.showUnsorted = !this.showUnsorted; this.refresh(); } },
        (this.showUnsorted ? '▾ ' : '▸ ') + `未分类 ${rest.length}`),
      ...(this.showUnsorted ? [this._dropZone(h('div.unsorted-list', null,
        ...(rest.length ? rest.map(t => this._item(t)) : [h('div.muted.small', null, '没有未分类的任务。')])), null)] : []));
  },

  _cell(q, tasks){
    const Q = QUADS[q];
    const input = h('input.quad-add', { placeholder: '＋ 添加', maxLength: 200, onkeydown: e => {
      if (e.key !== 'Enter' || e.isComposing || !input.value.trim()) return;
      const p = parseQuickDue(input.value);
      if (p.time) Reminders.askPermission();
      const t = { id: uid(), listId: 'inbox', title: p.title, notes: '', due: p.due, time: p.time, remind: p.time ? 0 : null,
        done: false, doneAt: 0, createdAt: Date.now(), quad: q };
      Reminders.settle(t);   // 写的时间今天已经过了：不马上响
      Store.update(d => d.tasks.push(t));
      setTimeout(() => { const again = this.el.grid.querySelector(`.quad[data-q="${q}"] .quad-add`); if (again) again.focus(); });
    } });
    return this._dropZone(h('div.quad', { 'data-q': q, style: quadVars(q) },
      h('div.quad-head', null, h('b', null, Q.act), h('span.quad-name', null, Q.name), h('span.n', null, tasks.length || '')),
      h('div.quad-list', null, ...tasks.map(t => this._item(t))),
      input), q);
  },

  /* 能接住拖过来的任务：q = 1–4 分进该格，null = 取消分类 */
  _dropZone(el, q){
    el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain');
      if (id) this.setQuad(id, q);
    });
    return el;
  },

  _item(t){
    return h('div.q-item', { draggable: true, title: '拖到别的格子里换分类；点标题看详情',
        ondragstart: e => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('dragging'); },
        ondragend: e => e.currentTarget.classList.remove('dragging') },
      checkBox(false, () => Tasks.toggleDone(t.id)),
      h('span.q-title', { onclick: () => Tasks.reveal(t.id) }, t.title),
      t.due ? h('span.q-due' + (isLate(t) ? '.overdue' : ''), null, dueText(t)) : null);
  },
};
