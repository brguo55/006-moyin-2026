"use strict";
/* ============================================================
   app/util.js：DOM 小工具 / 日期 / id / 小纸条提示 / 卷轴对话框
   ============================================================ */

/* h('button#id.btn.primary', { onclick }, '文字', child…)：建元素。文字一律走 textContent，不拼 HTML */
function h(tag, attrs, ...kids){
  const [head, ...cls] = tag.split('.');
  const [name, id] = head.split('#');
  const el = document.createElement(name || 'div');
  if (id) el.id = id;
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), x);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()){
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/* 改字：和现在一样就不动（每半秒刷新一次的数字，没变的时候不去碰 DOM） */
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* 日期统一用本地时区的 'YYYY-MM-DD' 字符串 */
const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const WEEK = '日一二三四五六';

/* 截止日期的口语说法：今天 / 明天 / 昨天 / 周三 / 10月5日 */
function dueLabel(k){
  const t = dayKey(), diff = Math.round((keyToDate(k) - keyToDate(t)) / 864e5);
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  const d = keyToDate(k);
  if (diff > 1 && diff < 7) return '周' + WEEK[d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日` + (d.getFullYear() !== new Date().getFullYear() ? `（${d.getFullYear()}）` : '');
}

/* 「3 分钟前」 */
function ago(ts){
  if (!ts) return '从未';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
  if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
  return Math.floor(s / 86400) + ' 天前';
}

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };

/* 轻提示（右下角一张小纸条，几秒后消失） */
function toast(msg){
  const el = h('div.toast', null, msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 2600);
}

/* 字符画 → 像素小图标（SVG，k 是一格；颜色跟着 fill）。整张图是一条 path，每行连着的几格合成一段（不是一格一个 rect：元素少，复制得快） */
const pixSvg = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges"><path d="` +
  rows.map((r, y) => [...r.matchAll(/k+/g)].map(m => `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`).join('')).join('') + '"/></svg>';
/* SVG 字符串 → 元素：每种只解析一次，之后复制（一页几百个勾选框时，每个都用 innerHTML 解析很慢） */
const svgParsed = new Map();
function svgEl(markup){
  let t = svgParsed.get(markup);
  if (!t){ t = document.createElement('template'); t.innerHTML = markup; svgParsed.set(markup, t); }
  return t.content.firstChild.cloneNode(true);
}

/* ---------- 像素卷轴：代替浏览器自带的 prompt / confirm，也给声音台、月历用 ----------
   ask({ title, text, input, value, placeholder, ok, danger }) → Promise
   input = true：要填字，返回填好的字（去掉首尾空格；取消 = null）；否则返回 true / false
   打开时卷轴从上往下展开，兔耳小鸟飞过来停在上面扑腾；Esc / 点外面 = 取消 */
const SEAL_SVG = pixSvg(['kkkkkkk', '...k...', 'kkkkkkk', 'k..k..k', 'k.k.k.k', 'k..k..k', 'k.k.k.k']);   // 红色小印章：「雨」
let birdStrip = null;
function dlgBird(){
  if (typeof BUNNY === 'undefined') return null;
  if (!birdStrip){   // 场景里那只兔耳小鸟（sprites.js），两帧拼成一条，css 一格一格地换
    const a = BUNNY[0].l, c = document.createElement('canvas');
    c.width = a.width * 2; c.height = a.height;
    const g = c.getContext('2d');
    g.drawImage(BUNNY[0].l, 0, 0); g.drawImage(BUNNY[1].l, a.width, 0);
    birdStrip = { url: c.toDataURL(), w: a.width * 2, h: a.height * 2 };   // 一个像素 = 2 css 像素
  }
  return h('span.dlg-bird', { 'aria-hidden': 'true', style: { '--bw': birdStrip.w + 'px', '--bh': birdStrip.h + 'px', backgroundImage: `url(${birdStrip.url})` } });
}
/* 卷轴卡片（声音台、月历这种会一直开着调东西的也用它）：
   scrollCard({ title, body, wide, closable, focus, onClose }) → { close, paper }
   body 是纸上的内容；closable = 右上角一个 ×；Esc / 点外面也会关（关之前调 onClose）；
   卷轴开着的时候，按键不去操控 rabbit；Tab 只在卷轴里转 */
let dlgN = 0;
function scrollCard({ title, body, wide = false, closable = true, focus = null, onClose = null }){
  const prev = document.activeElement, tid = 'dlg-title-' + (++dlgN);   // 两张卷轴叠着时，标题的 id 也不重复
  const x = closable ? h('button.dlg-x', { title: '关上', 'aria-label': '关上' }, '×') : null;
  const paper = h('div.dlg-paper', null, h('div.dlg-inner', null,
    h('div.dlg-head', null, h('h3.dlg-title', { id: tid }, title), x), ...[].concat(body)));
  // tabindex -1：点到纸上没有按钮的地方，焦点停在卷轴上（不会掉回页面上，Esc、Tab 照样管用，按键也不会去操控 rabbit）
  const box = h('div.dlg' + (wide ? '.wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': tid, tabindex: '-1' },
    dlgBird(), h('div.dlg-rod'), paper, h('div.dlg-rod'));
  const back = h('div.dlg-back', null, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (onClose) onClose();
    paper.style.setProperty('--h', paper.offsetHeight + 'px');   // 卷回去：从现在的高度收到 0
    box.classList.remove('opening'); box.classList.add('closing'); back.classList.add('closing');
    setTimeout(() => back.remove(), 260);
    if (prev && prev.isConnected) prev.focus({ preventScroll: true });
  };
  if (x) x.onclick = close;
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  back.addEventListener('keydown', e => {
    e.stopPropagation();   // 卷轴开着时，按键不去操控 rabbit
    if (e.isComposing) return;
    if (e.key === 'Escape'){ e.preventDefault(); close(); }
    else if (e.key === 'Tab'){   // Tab 只在卷轴里转
      const fs = [...paper.querySelectorAll('button:not([disabled]), input, select, textarea')], i = fs.indexOf(document.activeElement), n = fs.length;
      if (!n) return;
      e.preventDefault();
      fs[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();   // 焦点在卷轴本身上时：Tab 到第一个，Shift+Tab 到最后一个
    }
  });
  back.addEventListener('keyup', e => e.stopPropagation());
  document.body.append(back);
  paper.style.setProperty('--h', paper.scrollHeight + 'px');   // 展开到内容的高度
  box.classList.add('opening');
  paper.addEventListener('animationend', () => box.classList.remove('opening'), { once: true });
  const first = focus || x || paper.querySelector('button, input');
  if (first) first.focus({ preventScroll: true });
  return { close, paper };
}
function ask({ title, text = '', input = false, value = '', placeholder = '', max = 60, ok = '确定', danger = false }){
  return new Promise(done => {
    const field = input ? h('input.dlg-input', { value, placeholder, maxLength: max }) : null;
    const no = h('button.btn.ghost', null, '取消');
    const yes = h('button.btn.primary' + (danger ? '.danger' : ''), null, ok);
    const seal = h('span.dlg-seal', { 'aria-hidden': 'true' }, svgEl(SEAL_SVG));
    let result = input ? null : false;   // Esc / 点外面 / 取消
    const card = scrollCard({ title, closable: false, focus: field || (danger ? no : yes), onClose: () => done(result),   // 删除之类的：默认停在「取消」上
      body: [text ? h('p.dlg-text', null, text) : null, field, h('div.dlg-btns', null, seal, no, yes)] });
    yes.onclick = () => { result = input ? field.value.trim() : true; card.close(); };
    no.onclick = () => card.close();
    if (field){
      field.select();
      field.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing){ e.preventDefault(); yes.onclick(); } });
    }
  });
}

/* 防抖；flush() 立刻执行还没执行的那一次（没有待执行的就什么都不做） */
function debounce(fn, ms){
  let t = 0, pending = false;
  const run = () => { pending = false; fn(); };
  const d = () => { pending = true; clearTimeout(t); t = setTimeout(run, ms); };
  d.flush = () => { clearTimeout(t); if (pending) run(); };
  return d;
}
