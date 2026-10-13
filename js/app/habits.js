"use strict";
/* ============================================================
   app/habits.js：习惯打卡 —— 每天打卡、连续天数、近半年的水彩格子图
   ============================================================ */

/* 习惯的颜色：取自水体主题（淡彩 + 深一阶） */
const HABIT_COLORS = [2, 3, 4, 5, 6, 0].map(i => ({ name: THEMES[i].name, fill: THEMES[i].W, ink: THEMES[i].DK }));
const HEAT_WEEKS = 22;

/* 当前连续 / 最长连续 / 总次数。今天还没打卡不算断：从昨天往前数 */
function habitStats(checks = {}){
  const keys = Object.keys(checks).filter(k => checks[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys){
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run); prev = k;
  }
  let cur = 0, d = dayKey();
  if (!checks[d]) d = addDays(d, -1);
  while (checks[d]){ cur++; d = addDays(d, -1); }
  const month = dayKey().slice(0, 7);
  return { cur, best, total: keys.length, month: keys.filter(k => k.startsWith(month)).length };
}

const Habits = {
  openId: null,
  el: {},

  mount(root){
    const e = this.el;
    e.input = h('input.add-input', { placeholder: '新习惯，比如「读书 20 分钟」，回车添加', maxLength: 60,
      onkeydown: ev => { if (ev.key === 'Enter' && !ev.isComposing) this._add(); } });
    e.list = h('div.habit-list');
    root.append(h('div.add-row', null, e.input), e.list);
  },
  _add(){
    const name = this.el.input.value.trim();
    if (!name) return;
    Store.update(d => d.habits.push({ id: uid(), name, color: d.habits.length % HABIT_COLORS.length, createdAt: Date.now() }));
    this.el.input.value = '';
  },
  toggle(id, k){
    let on = false;
    Store.update(d => {
      const c = d.checks[id] || (d.checks[id] = {});
      if (c[k]) delete c[k]; else { c[k] = 1; on = true; }
    });
    if (on && k === dayKey()) celebrate();
  },

  refresh(){
    const d = Store.data;
    if (!d.habits.length){
      this.el.list.replaceChildren(h('div.empty', null, '还没有习惯。每天做一点，雨会记得。'));
      return;
    }
    this.el.list.replaceChildren(...d.habits.map(hb => this._card(hb)));
  },
  _card(hb){
    const checks = Store.data.checks[hb.id] || {}, st = habitStats(checks);
    const col = HABIT_COLORS[hb.color] || HABIT_COLORS[0], today = dayKey();
    const open = this.openId === hb.id;
    const card = h('div.habit' + (open ? '.open' : ''), { style: { '--hc': rgb(col.fill), '--hk': rgb(col.ink) } });
    card.append(
      h('div.h-head', { onclick: () => { this.openId = open ? null : hb.id; this.refresh(); } },
        h('span.h-dot'), h('span.h-name', null, hb.name),
        h('span.h-streak', null, st.cur ? `连续 ${st.cur} 天` : (checks[today] ? '' : '今天还没打卡'))),
      // 最近 7 天（今天在最右）
      h('div.h-week', null, ...[...Array(7)].map((_, i) => {
        const k = addDays(today, i - 6), on = !!checks[k];
        return h('button.h-day' + (on ? '.on' : '') + (k === today ? '.today' : ''),
          { title: k, onclick: () => this.toggle(hb.id, k) },
          h('span.h-wd', null, k === today ? '今' : WEEK[keyToDate(k).getDay()]),
          h('span.h-box', null, on ? '✓' : ''));
      })),
    );
    if (open) card.append(this._detail(hb, checks, st, col));
    return card;
  },
  _detail(hb, checks, st, col){
    const today = dayKey();
    // 格子图：每列一周（周日在上），最右一列是本周
    const start = addDays(today, -((keyToDate(today).getDay()) + 7 * (HEAT_WEEKS - 1)));
    const grid = h('div.heat');
    for (let w = 0; w < HEAT_WEEKS; w++){
      const colEl = h('div.heat-col');
      for (let dw = 0; dw < 7; dw++){
        const k = addDays(start, w * 7 + dw);
        const future = k > today;
        colEl.append(h('button.heat-cell' + (checks[k] ? '.on' : '') + (future ? '.future' : ''),
          { title: k, disabled: future, onclick: () => this.toggle(hb.id, k) }));
      }
      grid.append(colEl);
    }
    return h('div.h-detail', null,
      grid,
      h('div.h-stats', null,
        h('span', null, `最长连续 ${st.best} 天`), h('span', null, `本月 ${st.month} 次`), h('span', null, `共 ${st.total} 次`)),
      h('div.h-colors', null, ...HABIT_COLORS.map((c, i) => h('button.h-color' + (i === hb.color ? '.on' : ''),
        { title: c.name, style: { background: rgb(c.fill) },
          onclick: () => Store.update(d => { d.habits.find(x => x.id === hb.id).color = i; }) }))),
      h('div.t-actions', null,
        h('button.btn.ghost', { onclick: async () => {
          const name = await ask({ title: '习惯改名', input: true, value: hb.name, ok: '改名' });
          if (name) Store.update(d => { const x = d.habits.find(y => y.id === hb.id); if (x) x.name = name; });
        } }, '改名'),
        h('button.btn.ghost', { onclick: async () => {
          if (!await ask({ title: '删除习惯', text: `删除习惯「${hb.name}」和它的全部打卡记录？`, ok: '删除', danger: true })) return;
          Store.update(d => { d.habits = d.habits.filter(x => x.id !== hb.id); delete d.checks[hb.id]; });
        } }, '删除')),
    );
  },
};
