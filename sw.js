/* ============================================================
   sw.js：离线缓存 —— 先用缓存秒开，同时在后台取最新版本更新缓存
   （改了文件不用手动改版本号；下次打开就是新版。只有增删文件时才需要改 SHELL）
   用户数据在 IndexedDB 里，与这里的缓存无关，清缓存不会丢数据。
   ============================================================ */
const CACHE = 'tingyu-rabbit-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/stage.css', 'css/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/stage/engine.js', 'js/stage/palette.js', 'js/stage/pixel.js', 'js/stage/sprites.js',
  'js/stage/room.js', 'js/stage/house.js', 'js/stage/ui.js', 'js/stage/audio.js', 'js/stage/main.js',
  'js/app/util.js', 'js/app/store.js', 'js/app/backup.js', 'js/app/tasks.js', 'js/app/matrix.js',
  'js/app/pomodoro.js', 'js/app/habits.js', 'js/app/countdown.js', 'js/app/settings.js', 'js/app/app.js',
  ...['00_idle_rabbit_right', '01_idle_rabbit_left', '02_jump_rabbit_right', '03_jump_rabbit_left',
       '04_jump_sec_rabbit_right', '05_jump_sec_rabbit_left', '20_nap_rabbit', '21_wake_rabbit',
       '40_focus_rabbit_one', '41_focus_rabbit_two', '60_done_rabbit', '61_stretch_rabbit'].map(f => `assets/rabbit/${f}.png`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* 像素字体（jsDelivr 上的 Fusion Pixel）：第一次联网时存下来，之后离线也能用 */
const FONT_HOST = 'cdn.jsdelivr.net';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'GET' && new URL(req.url).host === FONT_HOST && req.url.includes('fusion-pixel')){
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    if (hit){ e.waitUntil(fresh); return hit; }   // 有缓存：先给缓存，后台更新
    return fresh;
  }));
});
