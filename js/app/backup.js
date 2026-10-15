"use strict";
/* ============================================================
   app/backup.js：备份 —— 三层保险
     1. 自动备份到文件夹（Chrome / Edge 的 File System Access API）
        每次改动约 4 秒后写一次：tingyu-latest.json（最新）+ tingyu-YYYY-MM-DD.json（每天一份），
        每天的快照保留最近 30 天。建议选网盘（Google Drive / OneDrive / Dropbox）同步的文件夹。
     2. 一键导出 / 导入（任何浏览器都能用，也是换电脑时的后备方案）
     3. 备份状态一直显示；太久没备份会提醒
   备份文件是带版本号的普通 JSON，打开就能看懂；导入时自动补齐 / 升级字段（store.js migrate）
   ============================================================ */

const BACKUP_KEEP_DAYS = 30;
const BACKUP_REMIND_DAYS = 3;

async function writeTextFile(dir, name, text){
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

const Backup = {
  info: { lastAt: 0, kind: '', folder: '', folderAt: 0 },  // kind: 'folder' 自动 / 'export' 手动
  dir: null,
  perm: 'none',      // none 未设置 / granted 正常 / prompt 需要点一下重新授权 / unsupported 浏览器不支持
  supported: typeof window.showDirectoryPicker === 'function',
  persisted: false,  // 浏览器是否答应「不在空间紧张时清掉本站数据」
  error: '',
  _subs: [],

  async init(){
    Object.assign(this.info, await KV.get('backup') || {});
    // 请浏览器别在空间紧张时清掉本站数据。浏览器可能过好几秒才回话，所以不等它
    if (navigator.storage && navigator.storage.persist){
      navigator.storage.persisted()
        .then(p => p || navigator.storage.persist())
        .then(p => { this.persisted = !!p; this._emit(); })
        .catch(() => {});
    }
    if (!this.supported){ this.perm = 'unsupported'; return; }
    this.dir = await KV.get('dir') || null;
    if (this.dir){
      try { this.perm = (await this.dir.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : 'prompt'; }
      catch (e){ this.perm = 'prompt'; }
    }
    if (this.perm === 'granted') this.writeFolder(false);
  },
  subscribe(fn){ this._subs.push(fn); },
  _emit(){ for (const fn of this._subs) fn(); },

  /* 太久没备份了吗（已经在自动备份的不提醒；还没有任何数据的新用户也不提醒） */
  overdue(){
    if (this.perm === 'granted' && !this.error) return false;
    const d = Store.data;
    if (!d.tasks.length && !d.habits.length && !d.pomos.length) return false;
    const since = this.info.lastAt || d.meta.createdAt;
    return Date.now() - since > BACKUP_REMIND_DAYS * 864e5;
  },

  serialize(data = Store.data){
    return JSON.stringify({ app: 'tingyu', format: 1, exportedAt: new Date().toISOString(), data }, null, 1);
  },
  async _mark(kind){
    this.info.lastAt = Date.now();
    this.info.kind = kind;
    await KV.set('backup', this.info);
    this._emit();
  },

  /* ---------- 1. 自动备份到文件夹 ---------- */
  async chooseFolder(){
    try {
      const dir = await window.showDirectoryPicker({ id: 'tingyu-backup', mode: 'readwrite' });
      this.dir = dir;
      await KV.set('dir', dir);
      this.perm = 'granted';
      this.info.folder = dir.name;
      await this.writeFolder(true);
      toast(`已开启自动备份：${dir.name}`);
    } catch (e){
      if (e.name !== 'AbortError') toast('没能使用这个文件夹：' + e.message);
    }
  },
  /* 浏览器重启后可能要再点一下「允许」（必须由点击触发） */
  async reconnect(){
    if (!this.dir) return this.chooseFolder();
    try {
      const p = await this.dir.requestPermission({ mode: 'readwrite' });
      this.perm = p === 'granted' ? 'granted' : 'prompt';
      if (this.perm === 'granted') await this.writeFolder(true);
    } catch (e){ toast('授权失败：' + e.message); }
    this._emit();
  },
  async stopFolder(){
    this.dir = null; this.perm = this.supported ? 'none' : 'unsupported';
    this.info.folder = '';
    await KV.del('dir');
    await KV.set('backup', this.info);
    this._emit();
  },
  async writeFolder(force){
    if (this.perm !== 'granted' || !this.dir) return;
    if (!force && Store.data.meta.updatedAt <= this.info.folderAt) return;   // 没有新改动
    try {
      const text = this.serialize(), today = dayKey();
      await writeTextFile(this.dir, 'tingyu-latest.json', text);
      await writeTextFile(this.dir, `tingyu-${today}.json`, text);
      if (this._prunedOn !== today){ await this._prune(); this._prunedOn = today; }   // 清旧快照一天一次就够（不用每次保存都把文件夹翻一遍）
      this.info.folderAt = Store.data.meta.updatedAt;
      this.error = '';
      await this._mark('folder');
    } catch (e){
      this.error = e.message || String(e);
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') this.perm = 'prompt';
      this._emit();
    }
  },
  async _prune(){
    const names = [];
    for await (const [name] of this.dir.entries()) if (/^tingyu-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name);
    names.sort();
    while (names.length > BACKUP_KEEP_DAYS) await this.dir.removeEntry(names.shift());
  },
  async restoreFromFolder(){
    try {
      const fh = await this.dir.getFileHandle('tingyu-latest.json');
      await this._restore(await (await fh.getFile()).text(), `文件夹「${this.dir.name}」里的最新备份`);
    } catch (e){
      toast(e.name === 'NotFoundError' ? '这个文件夹里还没有听雨的备份' : '读取失败：' + e.message);
    }
  },

  /* ---------- 2. 手动导出 / 导入 ---------- */
  download(text, name){
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  async exportFile(){
    this.download(this.serialize(), `tingyu-backup-${dayKey()}.json`);
    await this._mark('export');
    toast('备份文件已下载，记得放到安全的地方（网盘里最好）');
  },
  async importFile(file){
    try { await this._restore(await file.text(), `文件「${file.name}」`); }
    catch (e){ toast('导入失败：' + e.message); }
  },
  async _restore(text, from){
    let obj;
    try { obj = JSON.parse(text); } catch (e){ throw new Error('文件不是有效的 JSON'); }
    if (!obj || obj.app !== 'tingyu' || !obj.data || !Array.isArray(obj.data.tasks)) throw new Error('这不是听雨的备份文件');
    const d = obj.data, when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : '未知时间';
    const ok = await ask({ title: '恢复备份', ok: '恢复', danger: true,
      text: `用${from}恢复？\n\n备份时间：${when}\n任务 ${d.tasks.length} 个 · 习惯 ${(d.habits || []).length} 个 · 番茄 ${(d.pomos || []).length} 个 · 倒数日 ${(d.countdowns || []).length} 个 · 日记 ${Object.keys(d.diary || {}).length} 篇\n\n现在的数据会被替换。替换前会先把现在的数据另存一份。` });
    if (!ok) return;
    // 先留一份现状，万一导错了还能找回
    const safety = this.serialize();
    if (this.perm === 'granted' && this.dir) await writeTextFile(this.dir, `tingyu-before-restore-${Date.now()}.json`, safety);
    else this.download(safety, `tingyu-before-restore-${dayKey()}.json`);
    Store.replace(d);
    onDataReplaced();
    toast('已恢复');
  },
};
Backup.schedule = debounce(() => Backup.writeFolder(false), 4000);
