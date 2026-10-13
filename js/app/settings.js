"use strict";
/* ============================================================
   app/settings.js：设置页 —— 备份（最重要）/ 面板显示 / 番茄钟 / 小房间 / 声音 / 安装 / 关于
   ============================================================ */

const Settings = {
  el: {},
  installEvt: null,

  mount(root){
    this.el.root = root;
    this.el.file = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
      onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) Backup.importFile(f); } });
    document.body.append(this.el.file);
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); this.installEvt = e; this.refresh(); });
  },

  refresh(){
    const B = Backup, d = Store.data;
    const kids = [];

    /* ---------- 备份 ---------- */
    const statusTxt = B.info.lastAt
      ? `上次备份：${ago(B.info.lastAt)}（${B.info.kind === 'folder' ? '自动备份到文件夹' : '手动导出'}）`
      : '还没有备份过';
    const folder = [];
    if (B.perm === 'unsupported'){
      folder.push(h('p.muted', null, '当前浏览器不支持自动备份到文件夹。请用电脑上的 Chrome 或 Edge 打开听雨，就能开启自动备份。'));
    } else if (B.perm === 'none'){
      folder.push(
        h('p', null, '选一个由网盘同步的文件夹（Google Drive / OneDrive / Dropbox），之后每次改动都会自动写一份备份进去，每天另存一份快照，保留最近 30 天。'),
        h('button.btn.primary', { onclick: () => B.chooseFolder() }, '选择备份文件夹'));
    } else {
      folder.push(h('p', null, '自动备份到：', h('b', null, B.info.folder || (B.dir && B.dir.name) || '文件夹'),
        B.perm === 'granted' ? (B.error ? h('span.warn', null, ` · 出错：${B.error}`) : h('span.ok', null, ' · 正常')) : h('span.warn', null, ' · 需要重新授权')));
      if (B.perm === 'prompt') folder.push(h('button.btn.primary', { onclick: () => B.reconnect() }, '重新连接文件夹'));
      folder.push(h('div.btn-row', null,
        B.perm === 'granted' ? h('button.btn', { onclick: async () => { await B.writeFolder(true); toast('已备份'); } }, '立即备份') : null,
        B.perm === 'granted' ? h('button.btn.ghost', { onclick: () => B.restoreFromFolder() }, '从文件夹恢复') : null,
        h('button.btn.ghost', { onclick: () => B.chooseFolder() }, '换一个文件夹'),
        h('button.btn.ghost', { onclick: async () => {
          if (await ask({ title: '停用自动备份', text: '停止自动备份？文件夹里已有的备份不会删除。', ok: '停用', danger: true })) B.stopFolder();
        } }, '停用')));
    }
    kids.push(h('section.set', null,
      h('h3', null, '备份'),
      h('p.backup-status' + (B.overdue() ? '.warn' : ''), null, statusTxt),
      h('h4', null, '自动备份到文件夹'), ...folder,
      h('h4', null, '手动导出 / 导入'),
      h('p', null, '随时导出一份备份文件；换电脑时，在新电脑上导入即可。'),
      h('div.btn-row', null,
        h('button.btn', { onclick: () => B.exportFile() }, '导出备份文件'),
        h('button.btn.ghost', { onclick: () => this.el.file.click() }, '导入备份文件')),
      h('ul.tips', null,
        h('li', null, '数据只存在这台电脑的浏览器里，不会上传到任何服务器，也不会上传到 GitHub。'),
        h('li', null, '备份文件夹千万不要放在 GitHub 仓库的文件夹里——仓库是公开的。'),
        h('li', null, '清除浏览器的「Cookie 和网站数据」、卸载 App 时勾选「同时清除数据」，都会删掉本机数据；有备份就能找回。'),
        h('li', null, B.persisted ? '浏览器已答应：空间紧张时也不会自动清掉听雨的数据。' : '建议用 Chrome / Edge 并安装成 App，数据更稳；Safari 会清掉一段时间没打开的网站数据。'))));

    /* ---------- 面板显示：每个功能可以选择要不要 ---------- */
    const hidden = d.settings.hidden;
    const toggle = id => Store.update(dd => {
      const hs = dd.settings.hidden, i = hs.indexOf(id);
      if (i >= 0) hs.splice(i, 1); else hs.push(id);
    });
    kids.push(h('section.set', null,
      h('h3', null, '面板显示'),
      h('p', null, '勾上的功能才会出现在右边的面板里。'),
      h('div.feature-list', null, ...TABS.filter(t => t.label).map(t =>
        h('label.switch', null, checkBox(!hidden.includes(t.id), () => toggle(t.id), t.label), ' ' + t.label))),
      h('p.muted', null, '取消勾选只是不显示，里面的数据都还在，重新勾上就回来了。「设置」会一直显示。'),
      h('p', null, '放大：面板右上角的方框按钮让面板铺满整个窗口，再点一下恢复。收起面板（›）时，左边的场景会放大铺满窗口；画面左上角小喇叭右边的方框按钮也能切换。')));

    /* ---------- 番茄钟：时长可以精确到秒 ---------- */
    kids.push(h('section.set', null,
      h('h3', null, '番茄钟'),
      h('p', null, '番茄钟页面有三种计时方式：番茄钟（专注 + 休息算一个循环，可以选一轮几个循环，开始后自动接着走）、计时器（倒数一次）、正计时（从 0 往上数，记下连续工作了多久）。'),
      h('p', null, '时长按「分:秒」填：25 或 25:00 是 25 分钟，25:05 是 25 分 5 秒。'),
      h('div.cfg-grid', null, ...Pomo.cfgFields()),
      h('p.muted', null, '和番茄钟页面里的「时长设置」是同一份，改哪边都行。正在进行的那一段不受影响，下一段开始生效。')));

    /* ---------- 小房子 ---------- */
    kids.push(h('section.set', null,
      h('h3', null, '小房子'),
      h('p', null, 'rabbit 坐在一把悬浮的金椅子上。A / D 左右飘，空格跳（按得越久跳得越高，空中再按一次是二段跳），站在家具上按 S 下来。屋子有一楼（门厅、书房、茶室、工作间）和阁楼，镜头会跟着他走；博古架、置物板、书案、窗台、床都能跳上去。开着番茄钟专注时，他会轮流喝茶、吃苹果；休息开始时伸个懒腰；30 秒没人理他就会打瞌睡：睡着时按键都不管用，要点他一下才醒。门口墙上有一块控制面板：点它，或者让 rabbit 飘到旁边按 E，就会打开设置。'),
      h('p.muted', null, '茶室墙上的挂轴就是番茄钟。点 rabbit 他会冒出红色爱心；完成任务、打卡、番茄结束时他会拍手庆祝。点兔耳小鸟它会跳一下。底部色板会换墙和地毯的颜色。')));

    /* ---------- 声音 ---------- */
    kids.push(h('section.set', null,
      h('h3', null, '声音'),
      h('label.switch', null,
        checkBox(d.settings.muted, () => toggleMute(), '静音'),
        ' 静音（叮的一声、番茄钟铃声；画面左上角的小喇叭或按 M 也能切换）'),
      h('p.muted', null, '点一下画面才会开始发声（浏览器的规定）。')));

    /* ---------- 安装 ---------- */
    const installed = matchMedia('(display-mode: standalone)').matches;
    kids.push(h('section.set', null,
      h('h3', null, '安装到电脑'),
      installed ? h('p', null, '已经作为 App 在运行。')
        : this.installEvt ? h('button.btn', { onclick: async () => { this.installEvt.prompt(); await this.installEvt.userChoice; this.installEvt = null; this.refresh(); } }, '安装听雨')
        : h('p.muted', null, '在 Chrome / Edge 地址栏右侧点「安装」图标，就能像普通 App 一样从程序坞 / 开始菜单打开，断网也能用。')));

    /* ---------- 关于 ---------- */
    kids.push(h('section.set', null,
      h('h3', null, '关于'),
      h('p.muted', null, `任务 ${d.tasks.length} 个 · 习惯 ${d.habits.length} 个 · 番茄 ${d.pomos.length} 个 · 倒数日 ${d.countdowns.length} 个`),
      h('p.muted', null, '快捷键：A / D 走，空格跳（空中再按 = 二段跳），S 下来，E 互动（在门口的控制面板旁按 E 打开设置），M 静音。')));

    this.el.root.replaceChildren(...kids);
  },
};
