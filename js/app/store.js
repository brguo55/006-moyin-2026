"use strict";
/* ============================================================
   app/store.js：数据 —— 全部存在本机浏览器的 IndexedDB 里
   ------------------------------------------------------------
   'data'    一切用户数据（任务 / 清单 / 习惯 / 打卡 / 番茄记录 / 设置）—— 备份的就是它
   'timer'   番茄钟进行中的状态（每次开始 / 暂停都变，不进备份）
   'backup'  备份状态（上次备份时间、方式、文件夹名）
   'dir'     自动备份文件夹的句柄（File System Access API）
   ============================================================ */

const DATA_VERSION = 1;
const DB_NAME = 'tingyu';   // 同一个 github.io 域名下的所有网页共用存储，名字要独特

const KV = {
  _db: null,
  open(){
    if (this._db) return this._db;
    this._db = new Promise((ok, fail) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
    return this._db;
  },
  async get(key){
    const db = await this.open();
    return new Promise((ok, fail) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    });
  },
  async set(key, val){
    const db = await this.open();
    return new Promise((ok, fail) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => ok();
      tx.onerror = () => fail(tx.error);
    });
  },
  async del(key){
    const db = await this.open();
    return new Promise(ok => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => ok();
    });
  },
};

/* 新用户的初始数据 */
function freshData(){
  const now = Date.now();
  return {
    version: DATA_VERSION,
    lists: [{ id: 'inbox', name: '收件箱', createdAt: now }],
    tasks: [],
    habits: [],
    checks: {},          // { 习惯id: { 'YYYY-MM-DD': 1 } }
    pomos: [],           // { id, start, end, minutes, taskId }
    countdowns: [],      // { id, name, date: 'YYYY-MM-DD', yearly, color, createdAt }
    settings: { weather: 0, theme: 2, ambient: true, muted: false, focusSec: 1500, shortSec: 300, longSec: 900, longEvery: 4,   // 番茄钟时长按秒存（25:05 这种也行）
                cycles: 4, timerSec: 600,   // 番茄钟一轮几个循环（0 = 不限）；计时器时长（秒）
                hidden: [] },   // hidden：设置里取消勾选、不在面板里显示的功能（页签 id）
    meta: { createdAt: now, updatedAt: now },
  };
}

/* 补齐缺失字段 / 升级旧版本：导入老备份、以后加新功能时都走这里 */
function migrate(d){
  const base = freshData();
  const out = Object.assign({}, base, d);
  out.settings = Object.assign({}, base.settings, d.settings);
  if (!Array.isArray(out.settings.hidden)) out.settings.hidden = [];
  // 老数据的时长是整数分钟（focusMin…）→ 换成秒
  for (const [sec, min] of [['focusSec', 'focusMin'], ['shortSec', 'shortMin'], ['longSec', 'longMin']]){
    if (d.settings && !(d.settings[sec] > 0) && d.settings[min] > 0) out.settings[sec] = d.settings[min] * 60;
    delete out.settings[min];
  }
  out.meta = Object.assign({}, base.meta, d.meta);
  for (const k of ['lists', 'tasks', 'habits', 'pomos', 'countdowns']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.checks || typeof out.checks !== 'object') out.checks = {};
  if (!out.lists.some(l => l.id === 'inbox')) out.lists.unshift(base.lists[0]);
  out.version = DATA_VERSION;
  return out;
}

const Store = {
  data: null,
  _subs: [],
  _chan: ('BroadcastChannel' in window) ? new BroadcastChannel('tingyu') : null,

  async load(){
    const d = await KV.get('data');
    this.data = d ? migrate(d) : freshData();
    if (!d) await KV.set('data', this.data);
    // 同时开了两个窗口：另一个窗口改了数据 → 这里重新读，避免互相覆盖
    if (this._chan) this._chan.onmessage = async e => {
      if (e.data !== 'changed') return;
      const nd = await KV.get('data');
      if (nd){ this.data = migrate(nd); this._emit(false); }
    };
  },
  /* 改数据统一走这里：Store.update(d => { d.tasks.push(...) })
     quiet = true：只保存、不重画面板（正在编辑的输入框不会被冲掉焦点） */
  update(fn, quiet){
    fn(this.data);
    this.data.meta.updatedAt = Date.now();
    this._save();
    this._emit(true, quiet);
  },
  replace(d){
    this.data = migrate(d);
    this.data.meta.updatedAt = Date.now();
    this._save();
    this._save.flush();   // 导入是大改动：立刻落盘
    this._emit(true);
  },
  subscribe(fn){ this._subs.push(fn); },
  _emit(local, quiet){ for (const fn of this._subs) fn(local, quiet); },
  _save: null,
};
Store._save = debounce(async () => {
  if (!Store.data) return;   // 还没读完就绝不写，防止把旧数据盖成空的
  try {
    await KV.set('data', Store.data);
    if (Store._chan) Store._chan.postMessage('changed');
  } catch (err){
    toast('保存失败：' + (err && err.message || err));
  }
}, 250);
// 关窗口前把还没写进去的改动写掉
addEventListener('pagehide', () => Store._save.flush());
document.addEventListener('visibilitychange', () => { if (document.hidden) Store._save.flush(); });
