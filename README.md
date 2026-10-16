# 听雨 · Tingyu

A planner that runs in the browser: tasks, a pomodoro timer and habit tracking, in cozy pixel art.

**Live:** https://brguo55.github.io/006-moyin-2026/

## Features

- **Tasks** — 今天至少完成 (today's must-dos) comes first: 3 slots by default (2 to 4), filled with real tasks. Unfinished ones stay until they're done, and finishing them all gets a cheer. Below that: lists, a Today view, search, notes, due dates with an optional time, reminders (on time or 5 minutes to 1 day early, as a system notification while the app is open), repeats (daily, weekdays, chosen weekdays, monthly, yearly; finishing one schedules the next), subtasks and tags (shown under each task and found by search). Type 明天 / 周五 / 下周一 and 15:00 / 下午3点 at the start or end of a task to set its date and time. Drag your own lists to reorder them; 今天, 全部 and 收件箱 stay in front. Unfinished tasks move to the new day at midnight instead of sitting on a past date.
- **Import from TickTick (滴答清单)** — pick the CSV from TickTick's "Generate Backup" in Settings. Lists, tasks, tags, notes, checklists and subtasks, due times, reminders, repeats and priorities come over; it only adds, never imports the same task twice, and the last import can be undone.
- **Bigger views** — the panel's maximize button makes it fill the window (with lists in a side column). Collapsing the panel, or the button next to the mute button, lets the scene grow to fill the window instead.
- **Pomodoro** — three ways to time: a pomodoro (focus + break = one cycle; pick how many cycles a run has, or unlimited, and it rolls on automatically), a countdown timer, and a stopwatch that records how long you worked without a break. Durations go to the second (e.g. 25:05, editable on the Pomodoro page or in Settings). Sessions can be linked to a task, with daily and weekly stats and an immersive full-screen mode. It stays accurate in a background tab and resumes after a reload.
- **轻重 (Eisenhower matrix)** — tag tasks 马上做 / 排时间 / 顺手做 / 放一放 (important × urgent). Add tasks inside a quadrant and drag them between quadrants.
- **Habits** — daily check-ins, current and best streaks, and a 22-week grid.
- **倒数 (countdowns)** — days until an exam, trip or deadline. Yearly ones (birthdays, anniversaries) repeat and show which year it is; past dates count up.
- **日记 (diary)** — a few lines a day with a weather mood (晴 / 阴 / 雨). It saves as you type, past days are listed below, and you can go back to fill in a day you missed.
- **House** — a pixel-art house where **rabbit** lives and you can play between tasks. See [The house](#the-house).
- **Pixel UI** — the panel uses the [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font) font (SIL OFL 1.1, loaded from jsDelivr and cached for offline use), square 2px borders and hard shadows. Questions such as naming a new list or confirming a delete open as a pixel hanging scroll that unrolls, with a red 雨 seal and the bunny-eared bird fluttering on top, instead of the browser's own pop-ups.
- **Offline & installable** — install it as an app from Chrome or Edge.

## The house

A cozy pixel-art side view in the style of Hollow Knight: 1800 × 500 pixels, about 4 screens wide and 2 tall. It is a Chinese-style wooden home on an artificial asteroid, with red lacquer pillars, fret patterns, lanterns and bookcases. Through the windows you see a domed courtyard in the rain and the star sea beyond.

- **Four parts**, left to right:
  - the entrance: a lattice door, a coat rack, a shoe bench, the control panel, a tear-off calendar and a training dummy;
  - the bookcases: a short one and a tall one, both standable;
  - the window: a moon-gate window with lanterns, the pomodoro scroll and a tea table;
  - the computer, the widest: a holo screen on a desk, an electronic clock, a task board, an armillary sphere, a drawer cabinet and a lattice window. Above it is the loft, with chests, a wardrobe and the bed.
- **Climbing** — above the entrance, the bookcases and the window, a few wall shelves a double jump apart make a Metroidvania-style course. The one in the top-left corner leads to the speaker. Two stacked shelves by the desk lead up to the loft.
- **Controls**:
  - A / D float left and right;
  - Space jumps: hold for higher, with coyote time, jump buffering and a slight hang at the apex; press again in the air for a flame-boosted double jump;
  - S drops through furniture;
  - E uses what is beside rabbit;
  - M mutes.
- **Things to use** — press E beside them, or click them:
  - the control panel opens Settings;
  - the calendar opens a month view with the 24 solar terms, task dots and diary marks;
  - the speaker mixes five synthesized ambiences, each with its own switch and volume: rain, wind, nature (a stream with birds by day and crickets at night), a crackling stove and a train.
- **rabbit** rides a hovering golden chair (commissioned pixel art), and his bunny-eared bird flies along.
  - During a focus session he takes turns sipping tea and eating an apple, and a break starts with a stretch.
  - After 3 minutes without input he dozes off (1, 3, 5 or 10 minutes, or never, in Settings). The scene dims a little while the panel stays bright, and the keys do nothing until you click him awake.
  - Click him and he reacts with hearts. Finish a task, check a habit or end a pomodoro and he claps.
- **Live details** — the hanging scroll shows the pomodoro countdown, the electronic clock shows the real time, it rains on the computer screen and the tea steams.
- **Time and seasons** — the view outside and the room's light follow the real clock (day, dusk and night; lanterns glow after dark). The vase by the tea table and an ornament by the door change with the solar terms.
- **Depth and color** — the view outside moves slower and the foreground pillars, vines and vases move faster. The color swatches tint the walls and rugs.

## Art

The scene is pixel art at 1 pixel = 2 world units, scaled up by whole numbers so pixels stay square. The house is drawn in code (`js/stage/house.js`), but every piece of furniture and decor is registered by name with its position and size, so an artist's PNG of the same size in `assets/house/` (with its id added to `PROP_ART`) replaces it without other code changes. rabbit's animations are sprite strips in `assets/rabbit/`, one 80 × 112 frame per cell, converted from the artist's GIFs. They keep the owner's folder and file names, e.g. `00_idle_rabbit_right` and `40_focus_rabbit_one`. They cover idle (left and right), a takeoff with a shockwave ring, a flame-boosted double jump, landing, napping, a reaction when you click him (it also wakes him), two focus loops (tea and an apple), clapping and stretching. His design is asymmetric (robe on one side, mech on the other), so left and right are drawn separately rather than mirrored. A pixel-art brief for commissioning artwork is in [`docs/art-brief/`](docs/art-brief/README.md): the four zones, the layers, every prop as its own reference image with position and size, the standable platforms, and the canvas rules for new rabbit animations. The direction is in [`docs/art-brief/concepts/`](docs/art-brief/concepts/README.md).

## Your data

Everything is stored locally in the browser (IndexedDB). Nothing is sent to a server or to GitHub.

Backups (Settings → 备份):

1. **Auto-backup to a folder** (Chrome / Edge) — pick a folder synced by Google Drive, OneDrive or Dropbox. The app writes `tingyu-latest.json` after every change, plus one dated snapshot per day, and keeps the last 30 days.
2. **Export / import** a backup file in any browser. Use this to move to a new computer.
3. The backup status is always visible, and you get a reminder if you haven't backed up for 3 days.

Never put the backup folder inside this repository — it is public. `tingyu-*.json` is git-ignored as a safety net.

## Development

Plain HTML, CSS and JavaScript: no dependencies and no build step. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

```
index.html, manifest.webmanifest, sw.js
css/              stage.css (canvas), app.css (panel)
js/stage/         the scene: engine, palette, pixel helpers, sprites, almanac (solar terms, daylight),
                  room.js (map, platforms, controls, camera), house.js (the house and its props),
                  ui (swatches and buttons), audio, ambience (synthesized sounds), main (loop and input)
js/app/           the panel: util, store (IndexedDB), backup, schedule (times, reminders, repeats),
                  tasks, matrix, pomodoro, habits, countdown, diary, ticktick (import), sounddesk,
                  calendar, settings, app (shell)
assets/rabbit/    rabbit's animation strips
docs/art-brief/   the brief for commissioning pixel art
icons/            app icons
```

To move a piece of furniture, change its numbers near the top of `js/stage/room.js` (pixel coordinates: left edge, right edge, top). The drawing in `house.js` and the platform rabbit stands on both follow.
