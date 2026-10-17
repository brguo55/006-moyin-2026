"use strict";
/* ============================================================
   app/calendar.js：月历 —— 点门口的日历（或者站在旁边按 E）打开
   一个月一页：今天、二十四节气（stage/almanac.js 算的）、那天有没做完的任务（小点）、写了日记（小方块）；
   点一天：下面列出那天的任务和日记，可以直接去写那天的日记
   ============================================================ */

const Calendar = {
  month: '', sel: '', card: null, el: {},
  open(){
    const today = dayKey();
    this.month = today.slice(0, 7); this.sel = today;
    this.el.body = h('div.cal');
    this.card = scrollCard({ title: '日历', wide: true, body: this.el.body, onClose: () => { this.card = null; } });
    this.render();
  },
  _shift(n){
    const [y, m] = this.month.split('-').map(Number), d = new Date(y, m - 1 + n, 1);
    this.month = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    this.render();
  },
  render(){
    if (!this.card) return;
    const today = dayKey(), [y, m] = this.month.split('-').map(Number), d = Store.data;
    const days = new Date(y, m, 0).getDate(), lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // 周一在最左
    const terms = new Map(termsOf(y).filter(t => t.day.startsWith(this.month)).map(t => [t.day, t.name]));
    const due = {};
    for (const t of d.tasks) if (!t.done && t.due && t.due.startsWith(this.month)) due[t.due] = (due[t.due] || 0) + 1;
    const cells = Array.from({ length: lead }, () => h('span.cal-pad'));
    for (let n = 1; n <= days; n++){
      const k = `${this.month}-${pad2(n)}`;
      cells.push(h('button.cal-day' + (k === today ? '.today' : '') + (k === this.sel ? '.sel' : ''),
        { onclick: () => { this.sel = k; this.render(); }, title: terms.get(k) || '' },
        h('span.cal-n', null, n),
        terms.has(k) ? h('span.cal-term', null, terms.get(k)) : null,
        h('span.cal-marks', null,
          due[k] ? h('i.cal-dot', { title: `${due[k]} 件没做完的任务` }) : null,
          d.diary[k] ? h('i.cal-diary', { title: '写了日记' }) : null)));
    }
    this.el.body.replaceChildren(
      h('div.cal-nav', null,
        h('button.icon-btn', { title: '上个月', onclick: () => this._shift(-1) }, '‹'),
        h('span.cal-month', null, `${y}年${m}月`),
        h('button.icon-btn', { title: '下个月', onclick: () => this._shift(1) }, '›'),
        today.startsWith(this.month) ? null : h('button.btn.small.ghost', { onclick: () => { this.month = today.slice(0, 7); this.sel = today; this.render(); } }, '回到今天')),
      h('div.cal-week', null, ...'一二三四五六日'.split('').map(w => h('span', null, w))),
      h('div.cal-grid', null, ...cells),
      this._detail());
  },
  /* 选中的那一天：日期和节气、那天的任务、日记 */
  _detail(){
    const k = this.sel, dt = keyToDate(k), today = dayKey(), term = termAt(k), d = Store.data;
    const nth = Math.round((dt - keyToDate(term.day)) / 864e5) + 1;
    const tasks = d.tasks.filter(t => t.due === k).sort((a, b) => (a.time || '99') < (b.time || '99') ? -1 : 1);
    const diary = d.diary[k], chars = diary ? [...diary.text.trim()] : [];   // 按字数（表情符号算一个字，不会被切成半个）
    const canDiary = k <= today && tabShown('diary');
    return h('div.cal-detail', null,
      h('div.cal-date', null, `${dt.getMonth() + 1}月${dt.getDate()}日 · 周${WEEK[dt.getDay()]}`,
        h('span.cal-tterm', null, nth === 1 ? `${term.name}（今天交节）` : `${term.name} · 第 ${nth} 天`)),
      tasks.length ? h('ul.cal-tasks', null, ...tasks.map(t => h('li' + (t.done ? '.done' : ''), null, (t.time ? t.time + ' ' : '') + t.title)))
        : h('div.muted.small', null, '这天没有任务。'),
      diary ? h('div.cal-diary-line', null, '日记：' + (chars.slice(0, 40).join('') || '（只选了心情）') + (chars.length > 40 ? '……' : '')) : null,
      canDiary ? h('div.btn-row', null, h('button.btn.small', { onclick: () => {
        this.card.close(); App.showTab('diary'); Diary.open(k);
      } }, diary ? '看这天的日记' : '写这天的日记')) : null);
  },
};
function openCalendar(){ Calendar.open(); }
