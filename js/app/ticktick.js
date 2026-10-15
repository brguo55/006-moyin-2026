"use strict";
/* ============================================================
   app/ticktick.js：从滴答清单（TickTick）搬家 —— 读滴答清单「生成备份」得到的 CSV
   搬过来：清单、任务（没做完的和做完的）、标签、备注、检查项和子任务（→ 子任务）、
           截止日期和时间（按任务原来的时区）、提醒、重复、优先级（→ 轻重：高 = 马上做，中 = 排时间，低 = 顺手做）
   只添加，不改不删已有的；导入过的任务记着滴答清单的 id（task.ticktickId），再导一次会跳过
   同一次导入的任务和新建的清单都带着 importBatch，设置里可以一键撤销
   CSV 前面有几行说明，表头那一行（Title、List Name、Status……）按名字找列，找不到的列就跳过
   ============================================================ */

/* CSV → 二维数组（引号里可以有逗号、换行，"" 是一个引号） */
function parseCsv(text){
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++){
    const c = text[i];
    if (quoted){
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"'){ cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ','){ row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r'){
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length){ row.push(cell); rows.push(row); }
  return rows;
}

/* 表头可能是英文，也可能是中文 */
const TT_COLS = {
  list: ['List Name', '清单名称', '清单'], title: ['Title', '标题'], kind: ['Kind', '类型'], tags: ['Tags', '标签'],
  content: ['Content', '内容'], checklist: ['Is Check list', 'Is Checklist', '是否检查清单'],
  due: ['Due Date', '截止日期', '到期日期'], reminder: ['Reminder', '提醒'], repeat: ['Repeat', '重复'],
  priority: ['Priority', '优先级'], status: ['Status', '状态'], created: ['Created Time', '创建时间'],
  completed: ['Completed Time', '完成时间'], timezone: ['Timezone', '时区'], allDay: ['Is All Day', '是否全天'],
  id: ['taskId', 'Task Id'], parent: ['parentId', 'Parent Id'],
};
const TT_INBOX = ['inbox', '收集箱', '收件箱'];
const TT_PRIORITY = { 5: 1, 3: 2, 1: 3 };   // 高 → 马上做，中 → 排时间，低 → 顺手做；没有优先级 → 未分类
/* 检查项：▫ 没勾 / ▪ 勾了（也认 ☐ ☑ ✓ 和 Markdown 的 - [ ] / - [x]） */
const TT_ITEM = /^\s*(▫|▪|☐|☑|☒|✓|✔|-\s*\[\s*\]|-\s*\[[xX✓]\]|\[\s*\]|\[[xX✓]\])\s*(.*)$/;

/* 「2026-10-05T16:00:00+0000」→ Date（时区写成 +0000 的也认） */
function ttDate(s){
  if (!s) return null;
  const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return isNaN(d) ? null : d;
}
/* 这个时刻在某个时区里是哪天、几点（每个时区的格式器只建一次：建一个很慢，几千个任务一个个建要好几秒） */
const ttFormats = new Map();
function ttLocal(d, tz){
  try {
    let f = ttFormats.get(tz);
    if (!f) ttFormats.set(tz, f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
    const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  } catch (e){
    return { day: dayKey(d), time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
  }
}
/* 重复规则（RRULE）→ 听雨的重复；隔几天 / 几周这种（INTERVAL > 1）听雨没有，按每 1 个导入，并在备注里写一句 */
function ttRepeat(raw, due){
  const rule = raw.replace(/^[A-Z]*RULE:/i, '');
  if (!due || !/FREQ=/i.test(rule)) return { repeat: null, note: '' };
  const kv = {};
  for (const part of rule.split(';')){ const [k, v] = part.split('='); if (k && v) kv[k.trim().toUpperCase()] = v.trim().toUpperCase(); }
  const days = (kv.BYDAY || '').split(',').map(x => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(x.replace(/^[-+\d]+/, ''))).filter(x => x >= 0);
  let repeat = null;
  if (kv.FREQ === 'DAILY') repeat = makeRepeat('day', due);
  else if (kv.FREQ === 'WEEKLY'){
    if (days.length === 5 && [1, 2, 3, 4, 5].every(x => days.includes(x))) repeat = makeRepeat('weekday', due);
    else { repeat = makeRepeat('week', due); if (days.length) repeat.days = days; }
  }
  else if (kv.FREQ === 'MONTHLY'){ repeat = makeRepeat('month', due); if (+kv.BYMONTHDAY > 0) repeat.monthDay = +kv.BYMONTHDAY; }
  else if (kv.FREQ === 'YEARLY') repeat = makeRepeat('year', due);
  const n = +kv.INTERVAL || 1, unit = { DAILY: '天', WEEKLY: '周', MONTHLY: '个月', YEARLY: '年' }[kv.FREQ];
  return { repeat, note: repeat && n > 1 && unit ? `（滴答清单里是每 ${n} ${unit}重复一次，听雨按每 1 ${unit}导入的）` : '' };
}

const TickTick = {
  /* 读 CSV，算出要添加的东西（不碰现有数据）→ { tasks, lists, skipped, subs } */
  plan(text, data){
    const rows = parseCsv(text);
    const hasCol = (r, names) => r.some(c => names.some(n => n.toLowerCase() === c.trim().toLowerCase()));
    const hi = rows.findIndex(r => hasCol(r, TT_COLS.title) && (hasCol(r, TT_COLS.status) || hasCol(r, TT_COLS.list)));
    if (hi < 0) throw new Error('看不懂这个文件。请用滴答清单「生成备份」下载的 .csv 文件');
    const head = rows[hi].map(c => c.trim().toLowerCase()), ix = {};
    for (const [k, names] of Object.entries(TT_COLS)) ix[k] = head.findIndex(c => names.some(n => n.toLowerCase() === c));
    const get = (r, k) => (ix[k] >= 0 && r[ix[k]] != null ? r[ix[k]] : '').trim();
    const batch = 'tt-' + Date.now().toString(36);
    const seen = new Set(data.tasks.map(t => t.ticktickId).filter(Boolean));
    const lists = [], listIds = new Map(data.lists.map(l => [l.name, l.id]));
    const listOf = name => {
      if (!name || TT_INBOX.includes(name.toLowerCase())) return 'inbox';
      if (!listIds.has(name)){ const l = { id: uid(), name, createdAt: Date.now(), importBatch: batch }; lists.push(l); listIds.set(name, l.id); }
      return listIds.get(name);
    };
    const items = [];
    let skipped = 0;
    for (const r of rows.slice(hi + 1)){
      const title = get(r, 'title');
      if (!title) continue;
      const ttid = get(r, 'id') || null;
      if (ttid && seen.has(ttid)){ skipped++; continue; }
      const status = get(r, 'status'), done = /^[12]$/.test(status) || /complete|完成/i.test(status);
      // 截止：按任务自己的时区换成那天几点；全天任务（或者 0 点）就没有时间
      const at = ttDate(get(r, 'due')), tz = get(r, 'timezone'), local = at ? ttLocal(at, tz) : null;
      const allDay = /^(true|y|yes|1)$/i.test(get(r, 'allDay'));
      const due = local ? local.day : null;
      let time = local && !allDay && local.time !== '00:00' ? local.time : null, remind = null;
      // 提醒：TRIGGER:-PT30M = 提前 30 分钟，PT0S = 准时；全天任务的 P0DT9H0M0S = 那天 9 点
      const trig = get(r, 'reminder').match(/TRIGGER:(-?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
      if (trig && due){
        const mins = ((+trig[2] || 0) * 7 + (+trig[3] || 0)) * 1440 + (+trig[4] || 0) * 60 + (+trig[5] || 0);
        if (time) remind = trig[1] ? REMIND_OPTS.map(o => o[0]).reduce((a, b) => Math.abs(b - mins) < Math.abs(a - mins) ? b : a) : 0;
        else if (!trig[1]){ time = `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`; remind = 0; }
      }
      // 备注和检查项
      const lines = get(r, 'content').replace(/\r\n?/g, '\n').split('\n');
      const isList = /^(y|yes|true|1)$/i.test(get(r, 'checklist')) || /checklist/i.test(get(r, 'kind'));
      const marked = lines.some(l => TT_ITEM.test(l)), subs = [], notes = [];
      for (const l of lines){
        const m = l.match(TT_ITEM);
        if (m && m[2].trim()) subs.push({ id: uid(), title: m[2].trim(), done: /[▪☑☒✓✔xX]/.test(m[1]) });
        else if (isList && !marked && l.trim()) subs.push({ id: uid(), title: l.trim(), done: false });
        else if (!m) notes.push(l);
      }
      const rep = done ? { repeat: null, note: '' } : ttRepeat(get(r, 'repeat'), due);
      const task = {
        id: uid(), listId: listOf(get(r, 'list')), title,
        notes: [notes.join('\n').trim(), rep.note].filter(Boolean).join('\n'),
        due, time, remind, repeat: rep.repeat,
        tags: [...new Set(get(r, 'tags').split(/[,，]/).map(g => g.trim().replace(/^[#＃]/, '')).filter(Boolean))],
        quad: TT_PRIORITY[get(r, 'priority')] || null,
        done, doneAt: done ? ((ttDate(get(r, 'completed')) || new Date()).getTime()) : 0,
        createdAt: (ttDate(get(r, 'created')) || new Date()).getTime(),
        ticktickId: ttid, importBatch: batch,
      };
      if (subs.length) task.subs = subs;
      Reminders.settle(task);   // 已经过去的提醒不补响
      items.push({ task, ttid, parent: get(r, 'parent') || null });
    }
    // 子任务：有 parentId、父任务也在这次导入里 → 并进父任务的子任务
    const byId = new Map(items.filter(x => x.ttid).map(x => [x.ttid, x.task]));
    const tasks = [];
    let subs = 0;
    for (const x of items){
      const p = x.parent && byId.get(x.parent);
      if (p && p !== x.task){ (p.subs = p.subs || []).push({ id: uid(), title: x.task.title, done: x.task.done }); subs++; }
      else tasks.push(x.task);
    }
    return { tasks, lists: lists.filter(l => tasks.some(t => t.listId === l.id)), skipped, subs };
  },

  async importFile(file){
    let p;
    try { p = this.plan(await file.text(), Store.data); }
    catch (e){ toast('导入失败：' + e.message); return; }
    if (!p.tasks.length){ toast(p.skipped ? `这个文件里的 ${p.skipped} 个任务之前都导入过了` : '这个文件里没有找到任务'); return; }
    const undone = p.tasks.filter(t => !t.done).length;
    const ok = await ask({ title: '从滴答清单导入', ok: '导入',
      text: `找到 ${undone} 个没做完的任务、${p.tasks.length - undone} 个做完的` + (p.subs ? `，还有 ${p.subs} 个子任务` : '') + '。'
        + (p.lists.length ? `\n会新建清单：${p.lists.map(l => l.name).join('、')}` : '')
        + (p.skipped ? `\n${p.skipped} 个之前导入过，这次跳过。` : '')
        + '\n\n只会添加，不改动、不删除听雨里已有的东西；导错了可以在设置里撤销。' });
    if (!ok) return;
    Store.update(d => { d.lists.push(...p.lists); d.tasks.push(...p.tasks); });
    toast(`导入了 ${p.tasks.length} 个任务` + (p.lists.length ? `，新建了 ${p.lists.length} 个清单` : ''));
  },
  /* 最近一次导入的批号（设置里显示「撤销」） */
  lastBatch(){
    let last = null;
    for (const x of [...Store.data.tasks, ...Store.data.lists]) if (x.importBatch && (!last || x.importBatch > last)) last = x.importBatch;
    return last;
  },
  async undo(){
    const b = this.lastBatch();
    if (!b) return;
    const n = Store.data.tasks.filter(t => t.importBatch === b).length;
    if (!await ask({ title: '撤销导入', ok: '撤销导入', danger: true,
      text: `删掉上次从滴答清单导入的 ${n} 个任务和那次新建的清单？\n之后你自己加的任务不受影响；放在那些清单里的会挪到收件箱。` })) return;
    Store.update(d => {
      const gone = new Set(d.lists.filter(l => l.importBatch === b).map(l => l.id));
      d.tasks = d.tasks.filter(t => t.importBatch !== b);
      for (const t of d.tasks) if (gone.has(t.listId)) t.listId = 'inbox';
      d.lists = d.lists.filter(l => l.importBatch !== b);
    });
    toast('已撤销这次导入');
  },
};
