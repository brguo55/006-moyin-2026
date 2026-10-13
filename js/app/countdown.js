"use strict";
/* ============================================================
   app/countdown.js：倒数 —— 离某一天还有多少天
   考试、旅行、截止日……；生日、纪念日可以「每年重复」（自动算下一次，并显示第几年）。
   已经过去的日子（不重复的）改为正数：「已经 N 天」。
   最近的那一个放大显示在最上面。
   ============================================================ */

/* 这一条下一次是哪天：不重复就是原日期；每年重复取今天或以后最近的一次（2 月 29 日在平年算 2 月 28 日） */
function cdTarget(cd, today){
  if (!cd.yearly) return cd.date;
  const [, m, d] = cd.date.split('-').map(Number);
  const on = y => `${y}-${pad2(m)}-${pad2(Math.min(d, new Date(y, m, 0).getDate()))}`;
  const y = +today.slice(0, 4);
  return on(y) >= today ? on(y) : on(y + 1);
}
const daysBetween = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);

function cdInfo(cd){
  const today = dayKey(), target = cdTarget(cd, today);
  const nth = cd.yearly ? +target.slice(0, 4) - +cd.date.slice(0, 4) : 0;   // 第几年（生日 = 几岁，纪念日 = 几周年）
  return { target, diff: daysBetween(today, target), nth };
}
function cdDateLine(cd, info){
  const d = keyToDate(info.target);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK[d.getDay()]}`
    + (cd.yearly ? ` · 每年${info.nth > 0 ? `（第 ${info.nth} 年）` : ''}` : '');
}

const Countdown = {
  openId: null,
  el: {},
  yearly: false,

  mount(root){
    const e = this.el;
    e.name = h('input.add-input', { placeholder: '倒数什么？比如「期末考试」', maxLength: 60,
      onkeydown: ev => { if (ev.key === 'Enter' && !ev.isComposing) this._add(); } });
    e.date = h('input.add-date', { type: 'date', title: '日期' });
    e.yearlyBox = h('span');
    e.list = h('div.cd-list');
    root.append(
      h('div.add-row', null, e.name, e.date),
      h('div.cd-add-opts', null,
        h('label.switch', null, e.yearlyBox, ' 每年重复（生日、纪念日）'),
        h('button.btn.small', { onclick: () => this._add() }, '添加')),
      e.list);
    this._yearlyBox();
  },
  _yearlyBox(){
    this.el.yearlyBox.replaceChildren(checkBox(this.yearly, () => { this.yearly = !this.yearly; this._yearlyBox(); }, '每年重复'));
  },
  _add(){
    const name = this.el.name.value.trim(), date = this.el.date.value;
    if (!name){ this.el.name.focus(); return; }
    if (!date){ toast('选一个日期'); this.el.date.focus(); return; }
    Store.update(d => d.countdowns.push({ id: uid(), name, date, yearly: this.yearly,
      color: d.countdowns.length % HABIT_COLORS.length, createdAt: Date.now() }));
    this.el.name.value = ''; this.el.date.value = ''; this.yearly = false; this._yearlyBox();
  },

  refresh(){
    const items = Store.data.countdowns.map(cd => ({ cd, info: cdInfo(cd) }));
    const upcoming = items.filter(x => x.info.diff >= 0).sort((a, b) => a.info.diff - b.info.diff);
    const past = items.filter(x => x.info.diff < 0).sort((a, b) => b.info.diff - a.info.diff);
    if (!items.length){
      this.el.list.replaceChildren(h('div.empty', null, '还没有倒数日。考试、生日、旅行……添加一个吧。'));
      return;
    }
    const [hero, ...rest] = [...upcoming, ...past];
    this.el.list.replaceChildren(this._card(hero, true), ...rest.map(x => this._card(x, false)));
  },

  _card({ cd, info }, big){
    const col = HABIT_COLORS[cd.color] || HABIT_COLORS[0];
    const open = this.openId === cd.id;
    const [label, num, unit] = info.diff > 0 ? ['还有', info.diff, '天'] : info.diff === 0 ? ['', '今天', ''] : ['已经', -info.diff, '天'];
    const card = h('div.cd' + (big ? '.big' : '') + (open ? '.open' : '') + (info.diff === 0 ? '.today' : '') + (info.diff < 0 ? '.past' : ''),
      { style: { '--hc': rgb(col.fill), '--hk': rgb(col.ink) } },
      h('div.cd-main', { onclick: () => { this.openId = open ? null : cd.id; this.refresh(); } },
        h('div.cd-text', null, h('div.cd-name', null, cd.name), h('div.cd-date', null, cdDateLine(cd, info))),
        h('div.cd-days', null,
          label ? h('span.cd-label', null, label) : null,
          h('span.cd-num', null, num),
          unit ? h('span.cd-unit', null, unit) : null)));
    if (open) card.append(this._edit(cd));
    return card;
  },
  _edit(cd){
    const set = (k, v) => Store.update(d => { const x = d.countdowns.find(y => y.id === cd.id); if (x) x[k] = v; });
    return h('div.cd-edit', null,
      h('input.t-edit-title', { value: cd.name, maxLength: 60, onchange: e => { const v = e.target.value.trim(); if (v) set('name', v); } }),
      h('div.t-fields', null,
        h('label', null, '日期 ', h('input', { type: 'date', value: cd.date, onchange: e => { if (e.target.value) set('date', e.target.value); } })),
        h('label.switch', null, checkBox(cd.yearly, () => set('yearly', !cd.yearly), '每年重复'), ' 每年重复')),
      h('div.h-colors', null, ...HABIT_COLORS.map((c, i) => h('button.h-color' + (i === cd.color ? '.on' : ''),
        { title: c.name, style: { background: rgb(c.fill) }, onclick: () => set('color', i) }))),
      h('div.t-actions', null,
        h('button.btn.ghost', { onclick: async () => {
          if (!await ask({ title: '删除倒数日', text: `删除倒数日「${cd.name}」？`, ok: '删除', danger: true })) return;
          Store.update(d => { d.countdowns = d.countdowns.filter(x => x.id !== cd.id); });
          this.openId = null;
        } }, '删除')));
  },
};
