# 听雨 · Tingyu

A planner that runs in the browser: tasks, a pomodoro timer and habit tracking, in cozy pixel art.

**Live:** https://brguo55.github.io/006-tingyu-2026/

## Features

- **Tasks** — lists, a Today view, search, notes and due dates. Type 明天 / 周五 / 下周一 at the start or end of a task to set its due date.
- **Pomodoro** — three ways to time: a pomodoro (focus + break = one cycle; pick how many cycles a run has, or unlimited, and it rolls on automatically), a countdown timer, and a stopwatch that records how long you worked without a break. Durations go to the second (e.g. 25:05, editable on the Pomodoro page or in Settings). Sessions can be linked to a task, with daily and weekly stats and an immersive full-screen mode. It stays accurate in a background tab and resumes after a reload.
- **轻重 (Eisenhower matrix)** — tag tasks 马上做 / 排时间 / 顺手做 / 放一放 (important × urgent). Add tasks inside a quadrant and drag them between quadrants.
- **Habits** — daily check-ins, current and best streaks, and a 22-week grid.
- **倒数 (countdowns)** — days until an exam, trip or deadline. Yearly ones (birthdays, anniversaries) repeat and show which year it is; past dates count up.
- **House** — a cozy pixel-art, Hollow Knight-style side-view map (1800 × 500 pixels, about 4 screens wide × 2 tall): a Chinese-style wooden home on an artificial asteroid, with red lacquer pillars, fret patterns, lanterns and curio shelves. Through a moon-gate window you see a domed courtyard in the rain and the star sea beyond. The camera follows **rabbit**, who rides a hovering golden chair (commissioned pixel art). A / D float left and right, Space jumps (hold for higher, with coyote time, jump buffering and a slight hang at the apex; press again in the air for a flame-boosted double jump), and S drops through furniture. E is reserved for interactions (none yet). While a pomodoro focus session runs he takes turns sipping tea and eating an apple, a break starts with a stretch, and after 30 seconds without input he dozes off (click him to wake him). The hanging scroll in the tea room shows the live countdown. Areas: entrance, a double-height library with shelves to climb, the tea room, a study with a holo screen (it rains on it) and a real-time wall clock, plus a loft with a bed, reached by shelf steps. Parallax: the view outside moves slower and foreground pillars, vines and vases move faster. His bunny-eared bird flies along. Click him for hearts; finish a task, check a habit or end a pomodoro and he claps. There's a mute button (key M), and the color swatches tint the walls and rug.
- **Pixel UI** — the panel uses the [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font) font (SIL OFL 1.1, loaded from jsDelivr and cached for offline use), square 2px borders and hard shadows.
- **Offline & installable** — install it as an app from Chrome or Edge.

## Art

The scene is pixel art at 1 pixel = 2 world units, scaled up by whole numbers so pixels stay square. The house is drawn in code (`js/stage/house.js`). rabbit's animations are sprite strips in `assets/rabbit/`, one 80 × 112 frame per cell, converted from the artist's GIFs. They keep the owner's folder and file names, e.g. `00_basic/00_idle_rabbit_right` and `02_pomodoro/00_focus_rabbit_one`. They cover idle (left and right), a takeoff with a shockwave ring, a flame-boosted double jump, landing, napping and waking, two focus loops (tea and an apple), clapping and stretching. His design is asymmetric (robe on one side, mech on the other), so left and right are drawn separately rather than mirrored. A pixel-art brief for commissioning artwork is in [`docs/art-brief/`](docs/art-brief/README.md), with the new direction in [`docs/art-brief/concepts/`](docs/art-brief/concepts/README.md).

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
css/          stage.css (canvas), app.css (panel)
js/stage/     map and controls (room.js), the pixel house (house.js), sprites (sprites.js, assets/rabbit/),
              pixel helpers (pixel.js), palette, canvas controls, audio
js/app/       util, store (IndexedDB), backup, tasks, pomodoro, habits, settings, app shell
icons/        app icons
```
