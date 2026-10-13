"use strict";
/* ============================================================
   app/diary.js：日记 —— 每天写几句，挑个天气当心情（晴 / 阴 / 雨）；
   下面列着写过的每一天，点一篇就能接着改；‹ › 可以补写前几天的（不能写以后的）
   数据：d.diary = { 'YYYY-MM-DD': { text, mood, updatedAt } }；那天没字也没心情，就删掉那一天
   ============================================================ */

/* 心情：9 × 9 的像素小天气（一格 = 2 css 像素） */
const MOODS = [
  { id: 'sun', name: '晴', rows: ['....k....', '.k.....k.', '...kkk...', '..kkkkk..', 'k.kkkkk.k', '..kkkkk..', '...kkk...', '.k.....k.', '....k....'] },
  { id: 'cloud', name: '阴', rows: ['.........', '.........', '...kk....', '..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', 'kkkkkkkkk', '.kkkkkkk.', '.........'] },
  { id: 'rain', name: '雨', rows: ['...kk....', '..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', '.kkkkkkk.', '.........', '.k..k..k.', 'k..k..k..', '.........'] },
].map(m => ({ ...m, icon: pixSvg(m.rows) }));
/* 小图标 + 字 */
function moodTag(m, tag){
  const el = h(tag + '.mood-' + m.id);
  el.innerHTML = m.icon;
  el.append(m.name);
  return el;
}

const Diary = {
  day: null,        // 正在写哪一天
  pinned: false,    // false = 跟着「今天」走（过了午夜自动换到新的一天）
  el: {},

  mount(root){
    const e = this.el;
    e.head = h('div.diary-head');
    e.moods = h('div.diary-moods');
    e.text = h('textarea.diary-text', { rows: 9, maxLength: 20000,
      oninput: () => this._save(), onchange: () => this._renderList() });
    e.status = h('div.diary-status');
    e.list = h('div.diary-list');
    root.append(e.head, e.moods, e.text, e.status, e.list);
  },

  _dayLine(k){
    const d = keyToDate(k), ago = Math.round((keyToDate(dayKey()) - d) / 864e5);
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK[d.getDay()]}`
      + (ago === 0 ? '（今天）' : ago === 1 ? '（昨天）' : '')
      + (d.getFullYear() !== new Date().getFullYear() ? `（${d.getFullYear()}）` : '');
  },
  /* 换到某一天来写 */
  open(k){
    const today = dayKey();
    this.day = k > today ? today : k;
    this.pinned = this.day !== today;
    this.refresh();
    App.el.body.scrollTo({ top: 0 });
    this.el.text.focus({ preventScroll: true });
  },

  refresh(){
    const today = dayKey(), typing = document.activeElement === this.el.text;
    if (!typing && (!this.pinned || !this.day || this.day > today)){ this.day = today; this.pinned = false; }   // 正在写的时候不换天
    const day = this.day, en = Store.data.diary[day] || {};
    this.el.head.replaceChildren(...[
      h('button.icon-btn.diary-nav', { title: '前一天', onclick: () => this.open(addDays(day, -1)) }, '‹'),
      h('span.diary-day', null, this._dayLine(day)),
      h('button.icon-btn.diary-nav', { title: '后一天', disabled: day >= today, onclick: () => this.open(addDays(day, 1)) }, '›'),
      day !== today ? h('button.btn.small.ghost', { onclick: () => this.open(today) }, '回到今天') : null,
    ].filter(Boolean));
    this._renderMoods(en.mood);
    if (!typing) this.el.text.value = en.text || '';
    this.el.text.placeholder = day === today ? '今天过得怎么样？' : '这一天过得怎么样？';
    this._status();
    this._renderList();
  },
  _renderMoods(cur){
    this.el.moods.replaceChildren(h('span.muted', null, '心情'), ...MOODS.map(m => {
      const b = moodTag(m, 'button.chip.mood' + (cur === m.id ? '.on' : ''));
      b.title = m.name;
      b.onclick = () => this._setMood(cur === m.id ? null : m.id);   // 再点一下 = 不选
      return b;
    }));
  },

  /* 改这一天的日记（安静保存，不打断打字）；没字也没心情就删掉这一天 */
  _put(fn){
    const day = this.day;
    Store.update(d => {
      const en = Object.assign({ text: '', mood: null }, d.diary[day]);
      fn(en);
      en.updatedAt = Date.now();
      if (!en.text.trim() && !en.mood) delete d.diary[day]; else d.diary[day] = en;
    }, true);
  },
  _save(){
    const v = this.el.text.value;
    this._put(en => { en.text = v; });
    this._status();
  },
  _setMood(id){
    this._put(en => { en.mood = id; });
    this._renderMoods(id);
    this._status();
    this._renderList();
  },
  _status(){
    const en = Store.data.diary[this.day];
    this.el.status.textContent = en ? `已保存 · ${[...en.text.replace(/\s/g, '')].length} 字` : '写的时候会自动保存';
  },

  /* 写过的日子：新的在上面，点一篇就换过去接着写 */
  _renderList(){
    const all = Store.data.diary, days = Object.keys(all).sort().reverse();
    if (!days.length){ this.el.list.replaceChildren(); return; }
    this.el.list.replaceChildren(
      h('div.diary-list-head', null, `写过的日子 · ${days.length} 篇`),
      ...days.map(k => {
        const en = all[k], m = MOODS.find(x => x.id === en.mood);
        return h('div.diary-item' + (k === this.day ? '.on' : ''), { onclick: () => this.open(k) },
          h('div.diary-item-head', null, h('span', null, this._dayLine(k)), m ? moodTag(m, 'span.diary-mood') : null),
          en.text.trim() ? h('div.diary-item-text', null, en.text.trim()) : null);
      }));
  },
};
