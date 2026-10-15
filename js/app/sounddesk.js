"use strict";
/* ============================================================
   app/sounddesk.js：音箱 —— 点门厅左上的音箱（或者站到它那块置物板上按 E）打开
   五种环境声（stage/ambience.js 现做的）：各自开关、调大小，可以几种一起放；
   记在 settings.sounds（{ rain: { on, vol } …}），下次打开听雨、点一下画面以后接着放
   ============================================================ */

const SOUND_ICON = {
  rain: pixSvg(['...kk....', '..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', '.kkkkkkk.', '.........', '.k..k..k.', 'k..k..k..', '.........']),
  wind: pixSvg(['......kk.', '.......k.', 'kkkkkkkk.', '.........', 'kkkkkkkkk', '........k', 'kkkkk..k.', '....k....', '...k.....']),
  nature: pixSvg(['......kkk', '....kkkkk', '...kkkkkk', '..kkkkkk.', '.kkkkkk..', '.kkkkk...', '.kkk.....', 'k........', 'k........']),
  fire: pixSvg(['....k....', '...kk....', '...kkk.k.', '..kkkkkk.', '.kkkkkkk.', '.kkk.kkk.', 'kkk...kkk', 'kkk...kkk', '.kkkkkkk.']),
  train: pixSvg(['.kkkkkkk.', 'k.......k', 'k.kk.kk.k', 'k.kk.kk.k', 'k.......k', 'kkkkkkkkk', 'k.k...k.k', '.kkkkkkk.', 'k.......k']),
};

const SoundDesk = {
  el: {},
  _cfg(id){ return Object.assign({ on: false, vol: 0.6 }, (Store.data.settings.sounds || {})[id]); },
  /* 改一种声音（开关 / 音量）：记下来、马上生效 */
  set(id, patch){
    const c = Object.assign(this._cfg(id), patch);
    Store.update(d => { d.settings.sounds = Object.assign({}, d.settings.sounds, { [id]: c }); }, true);
    initAudio();
    Ambience.set(id, c.on, c.vol);
  },
  /* 照设置把声音都放起来（能出声的时候、导入备份以后） */
  applyAll(){
    if (!Store.data || !AC) return;
    for (const s of SOUNDS){ const c = this._cfg(s.id); if (c.on || Ambience.ch[s.id]) Ambience.set(s.id, c.on, c.vol); }
  },

  open(){
    initAudio();
    this.el.rows = h('div.snd-rows');
    this.el.foot = h('div.snd-foot');
    this.card = scrollCard({ title: '音箱', onClose: () => { this.card = null; },
      body: [h('p.dlg-text', null, '挑几种声音一起放，滑块调大小。'), this.el.rows, this.el.foot] });
    this.render();
  },
  render(){
    if (!this.card) return;
    this.el.rows.replaceChildren(...SOUNDS.map(s => {
      const c = this._cfg(s.id), icon = h('span.snd-icon.snd-' + s.id, { 'aria-hidden': 'true' }, svgEl(SOUND_ICON[s.id]));
      const vol = h('input.snd-vol', { type: 'range', min: 0, max: 100, value: Math.round(c.vol * 100), 'aria-label': s.name + '的音量',
        oninput: e => { const v = +e.target.value / 100; this.set(s.id, { vol: v, on: v > 0 }); this._sync(); } });
      return h('div.snd-row' + (c.on ? '.on' : ''), { 'data-id': s.id },
        checkBox(c.on, () => { this.set(s.id, { on: !this._cfg(s.id).on }); this.render(); }, s.name),
        icon,
        h('span.snd-name', null, s.name, h('small', null, s.note)),
        vol);
    }));
    this._sync();
  },
  /* 底下一行：在放什么、全部停下；静音的时候提醒一下 */
  _sync(){
    const on = SOUNDS.filter(s => this._cfg(s.id).on);
    for (const row of this.el.rows.children){
      const isOn = this._cfg(row.dataset.id).on, box = row.querySelector('.check');
      row.classList.toggle('on', isOn); box.classList.toggle('on', isOn); box.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
    this.el.foot.replaceChildren(...[
      muted ? h('span.warn', null, '现在是静音。') : h('span.muted', null, on.length ? '在放：' + on.map(s => s.name).join('、') : '还没有放声音。'),
      muted ? h('button.btn.small', { onclick: () => { toggleMute(); this._sync(); } }, '取消静音') : null,
      on.length ? h('button.btn.small.ghost', { onclick: () => { for (const s of on) this.set(s.id, { on: false }); this.render(); } }, '全部停下') : null,
    ].filter(Boolean));
  },
};
function openSoundDesk(){ SoundDesk.open(); }
/* 浏览器让出声了（第一次点画面 / 按键）：上次开着的声音接着放 */
function onAudioReady(){ SoundDesk.applyAll(); }
