"use strict";
/* ============================================================
   main.js：主循环 + 交互 + 启动
   ============================================================ */

/* ---------- 主循环 ----------
   App 会一直开着，所以要省电：画面安静的时候（没在操作、rabbit 停着、镜头到位、没在换主题或开合面板）
   只画 IDLE_FPS 帧 / 秒（rabbit 的动画本来就是 10 帧 / 秒，看不出差别）；
   一按键、一动鼠标就马上回到每帧都画，操作不会变慢 */
const IDLE_FPS = 15;
let lastT = 0, wakeUntil = 0;
const wake = () => { wakeUntil = performance.now() + 800; };
function frame(now){
  requestAnimationFrame(frame);
  const quiet = now > wakeUntil && washT >= 1 && Math.abs(cxTo - CX) < 0.5 && Room.quiet();
  if (quiet && now - lastT < 1000 / IDLE_FPS - 2) return;
  const dt = Math.min(quiet ? 0.1 : 0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  CX += (cxTo - CX) * Math.min(1, dt * 7);                       // 面板开合：房间缓动到位
  if (washT < 1) washT = Math.min(1, washT + dt / WASH_DUR);     // 换主题：地毯 / 墙色慢慢晕开
  Room.update(dt);

  ctx.imageSmoothingEnabled = false;
  drawBackground();
  Room.draw();
  // rabbit 打瞌睡：纸、画框、房间都暗一点（色板、静音按钮和右边的面板不受影响）
  if (Room.dim) fillR(0, 0, W, H, `rgba(16,18,38,${(Room.dim * 0.25).toFixed(3)})`);
  drawSwatches();
  drawMuteBtn();
}

/* 完成一件事（任务 / 打卡 / 番茄）：rabbit 拍手庆祝、冒爱心 */
function celebrate(){ Room.celebrate(); }

/* ---------- 交互：点 rabbit / 点小鸟 / 点门口的控制面板 / 色板 / 静音 ---------- */
cv.addEventListener('pointerdown', e => {
  initAudio(); wake();
  const sw = hitSwatch(e.clientX, e.clientY);
  if (sw >= 0){ switchTheme(sw); return; }                        // 点色板：换颜色
  if (hitMuteBtn(e.clientX, e.clientY)){ toggleMute(); return; }  // 点小喇叭：静音 / 恢复
  Room.click(e.clientX, e.clientY);
});
cv.addEventListener('pointermove', e => {
  wake();
  const h = hitSwatch(e.clientX, e.clientY), hm = hitMuteBtn(e.clientX, e.clientY), hc = Room.hit(e.clientX, e.clientY);
  Room.hover = hc;
  if (h !== hoverIdx || hm !== muteHover){ hoverIdx = h; muteHover = hm; }
  cv.style.cursor = (h >= 0 || hm || hc) ? 'pointer' : '';
});

cv.addEventListener('pointerleave', () => { Room.hover = null; });

/* ---------- 键盘 ---------- */
/* 正在面板的输入框里打字时，不触发快捷键 */
const typing = e => { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
window.addEventListener('keydown', e => { initAudio(); wake(); });
// 屏蔽浏览器缩放快捷键（⌘/Ctrl + +/−/0）：画面已按视口自适应
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) &&
      (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_' || e.key === '0' ||
       e.key === ')' || e.key === '(')) e.preventDefault();
});
// A / D 走、空格跳、S 从家具上下来、E 互动、M 静音（用 e.code：中文输入法开着也认得）
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
  if (e.repeat && e.code === 'Space') { e.preventDefault(); return; }   // 按住不放不算连跳
  if (Room.keyDown(e.code)) { e.preventDefault(); return; }
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', e => {
  Room.keyUp(e.code);
  if (e.code === 'Space' && !typing(e)) e.preventDefault();   // 别让空格去「点」面板里刚点过的按钮
});
// 切走窗口 / 开始在输入框里打字：松开所有方向键，免得 rabbit 一直飘
window.addEventListener('blur', () => Room.clearKeys());
document.addEventListener('focusin', e => { if (typing(e)) Room.clearKeys(); });

/* ---------- 启动 ---------- */
window.addEventListener('resize', () => { resize(); wake(); });
resize();
requestAnimationFrame(frame);
