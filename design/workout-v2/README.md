# Handoff: Workout focus mode v2 — "Rest dock" (two-person rest timers)

## Overview

A redesign of the *gym workout* surfaces of Let's Get Buff (letsgetbuff.dk), aimed at two people
training on one phone:

1. **Rest dock** — rest countdowns move out of the blocking modal and into a persistent dock above
   the bottom nav, with **one lane per person**. Two people taking turns get two independent
   countdowns; two people resting together get one merged lane.
2. **Per-exercise rest mode** — every exercise remembers `together` / `turns` (and its rest length)
   locally, so the choice is made once, not every session.
3. **Per-side sets** — a `/side` exercise (Side Plank, Pallof Press, Single-Arm Row, Dumbbell Lunge)
   is one set with **two halves**: Left → "switch sides" → Right. The set only counts when both
   sides are logged, and a completed side always keeps a **↻ Redo** button (fixes the current bug
   where re-opening a timed rep shows no timer).
4. **Redesigned overview** — the workout list stops being a second logging surface and becomes the
   start line: participants, warm-up, drag-to-reorder order, one big Start.
5. **Redesigned Today (Home) card** — one primary action for the day.
6. **E-ink parity** — person identity is carried by label + solid/hatched fill, never hue.

Everything must ship behind a **switchable flag** so the old UI is one tap away (see
*Feature flag & rollback* below — this is a hard requirement, not a nice-to-have).

## About the design files

`Workout Redesign.dc.html` in this bundle is a **design reference written in HTML** — a static
prototype of look, layout and states. It is **not** production code and must not be copied into the
app. The task is to recreate these designs inside the existing client
(`client/` — React 18 + Vite + TypeScript, plain CSS custom properties in `client/src/app.css`, no
CSS framework), using the app's existing patterns: `useStore()`, `dispatch`, `useCountdown`,
`CountdownTimer`, dnd-kit, `localStorage` for device preferences.

Open the HTML file in a browser. It is a canvas: sections are labelled `1a`–`1f`; **`1a` is the
chosen direction**, `1d` (per-side + redo), `1e` (overview + today) and `1f` (e-ink) are shared and
also in scope. `1b` and `1c` are rejected alternatives — ignore them except as context.

## Fidelity

**High fidelity.** Colours, type sizes, weights, radii, paddings and copy in the prototype are
final and are listed exactly below. Recreate them pixel-close inside the app's existing shell
(`.app`, `.app-header`, `.app-nav`, `.focus-overlay`). Where the prototype hardcodes a hex, map it
to the token table at the bottom and add the new tokens to `app.css` for all three themes
(`dark`, `light`, `eink`).

---

## Feature flag & rollback (required)

**Goal:** turn the new design on to try it in the gym; if something is broken mid-session, turn it
off and finish the workout on the old UI, with no data loss and no redeploy.

### Mechanics

- Preference key: `localStorage['letsgetbuff-ui-v2']` = `'1' | '0'`. Default `'0'`.
- Provider: `client/src/store/uiVersion.tsx`, modelled on the existing
  `client/src/store/einkMode.tsx` (same shape: context + `useUiVersion()` hook returning
  `{ v2: boolean, setV2: (b: boolean) => void }`). Mount it in `App.tsx` next to `EinkModeProvider`.
- URL override, so a broken toggle can't trap you: `?ui=v2` / `?ui=v1` forces a version for the
  session and writes it to `localStorage` (mirror how test mode reads its flag).
- Switch UI in **two** places:
  - `SettingsView.tsx` — a preference card ("New workout screens (beta)") next to the existing
    preference cards in `components/settings/preferenceCards.tsx`.
  - The workout overview header — a small `⚡ New / Classic` chip, so the switch is reachable
    without leaving the gym floor. Flipping it re-renders in place; it must not end the session,
    clear the rest timers' wall-clock deadlines, or navigate.
- Escape hatch for a hard crash: the existing `ErrorBoundary` should, when `v2` is on, render a
  "Switch back to the classic workout screen" button that sets the key to `'0'` and reloads.

### Code layout

Do **not** modify the existing v1 components beyond the branch point. Add:

```
client/src/components/workout/v2/
  FocusModeV2.tsx        # slide shell, header, prev/next
  ExerciseCardV2.tsx     # current-set-large card, done-set chips
  RestDock.tsx           # the two-lane dock (the core of this design)
  useRestLanes.ts        # per-person countdown state, built on useCountdown
  restMode.ts            # per-exercise together/turns persistence
  SideSetStepper.tsx     # Left → switch → Right, with ↻ Redo
  WorkoutOverviewV2.tsx
```

Branch at the three call sites only:

- `views/WorkoutView.tsx` → `v2 ? <WorkoutOverviewV2/> : <existing markup>`
- `views/WorkoutView.tsx` focus render → `v2 ? <FocusModeV2/> : <FocusMode/>`
- `views/HomeView.tsx` today card → `v2 ? <TodayCardV2/> : <existing card>`

Both versions read and write the **same** `AppState` through the same reducer actions
(`LOG_EXERCISE`, `MARK_DAY_DONE`) and the same `sendProxyLog` path. No new schema version, no
migration, no change to the JSON export contract. A session started on v2 must be completable on
v1 and vice versa. The only v2-only persistence is device-local (`localStorage`), listed under
*State* below.

---

## Screens / views

### 1. Focus mode v2 (`1a` in the prototype) — the main screen

Full-bleed overlay, same role as today's `.focus-overlay` (max-width 480px on phone, 760px content
column ≥768px). Vertical stack: header / body / **rest dock** / prev-next bar.

**Header** (bg `--surface` `#131416`, 1px bottom border `--border` `#2c2f34`, padding `14px 14px 12px`, gap 10px)
- `Overview` button — `--surface2` fill, 1px border, radius 9px, padding `8px 12px`, Sora 13/600.
- Slide counter `3/9` — JetBrains Mono 13, `--text-muted`.
- Progress bar — flex 1, height 4px, track `--surface2`, fill `--accent`, radius 2px.
- Session elapsed `18:04` — JetBrains Mono 13, `--text-muted`. (Reuse `SessionTimer`.)

**Body** (padding `16px 14px`, gap 14px)
1. **Exercise title row** — name Sora 26/700, letter-spacing -0.6px; target `3×10` Mono 13
   `--text-muted`; right-aligned `▶ Form` button (transparent, 1px border, radius 8px,
   padding `6px 10px`, Sora 12/600) which expands the existing `VideoPanel`.
2. **Rest-mode switch** — card `--surface`, 1px border, radius 12px, padding 6px. Inside: a
   segmented control on `--bg`, radius 9px, padding 3px, gap 3px; each half `padding: 9px 0`,
   radius 7px, Sora 13. Inactive `--text-muted`; active `--accent` fill with `#0a0a0b` text, 700.
   Labels: `Together` / `Take turns`. To the right, two-line Mono 11 `--text-faint`:
   `saved for` / `<exercise name>`.
3. **Done-set chips** — horizontal row, gap 8px, Mono 12 `--text-faint`; each chip bg `#17181a`,
   1px `#24262a`, radius 7px, padding `6px 9px`, content `1 ✓ 60kg ×10`. Tapping a chip re-opens
   that set (shows logged value + edit, per *Interactions*).
4. **Current-set card** — bg `#17181a`, 1px `--border-strong` `#33363c`, radius 16px, padding 14px,
   gap 12px.
   - Owner pill: Mono 11, letter-spacing 0.1em, `--accent` on `--accent-dim` `#3a2a06`, radius 6px,
     padding `4px 8px`, text `YOU · SET 3 OF 3`. Right side: Mono 11 `--text-faint`
     `last 60kg ×10`.
   - Three input columns (kg / reps / RIR), gap 8px. Each: Mono 11 `--text-faint` uppercase caption
     above, then the field — bg `--bg`, 1px border (`#33363c` when filled, `#2c2f34` when empty),
     radius 10px, padding `14px 0`, centred Mono 22/700 (empty state: 500 weight, `--text-faint`).
     Tapping a field opens the numeric keyboard; the field is a real `<input type="number">` as
     today (`inputMode="decimal"` for kg).
   - Primary button — full width, min-height **60px**, `--accent` fill, `#0a0a0b` text, radius 12px,
     Sora 17/700, label `✓ Log set 3 · start my rest` (in *together* mode: `✓ Log set 3 · rest together`).
5. **Partner row** — bg `--surface`, 1px `--border`, **3px left border in the partner colour**,
   radius 12px, padding `12px 14px`. Name Sora 14/600 in `--partner`; below it Mono 11
   `--text-secondary` `set 2 of 3 · 55kg ×10`; right side Mono 11 hint `tap to log for her`.
   Tapping expands this row into the same current-set card, writing through `sendProxyLog`
   (existing proxy path) — this replaces the current "Log for: Me / <name>" toggle in the header.

**Rest dock** (bg `--surface`, 1px top border, padding `12px 14px`, gap 10px) — *the core of the design*
- One **lane** per participant. Lane = name label (width 52px, Mono 11/700, letter-spacing 0.06em,
  in that person's colour) + progress track (flex 1, height 10px, `--surface2`, radius 5px, fill in
  the person's colour) + remaining time (width 58px, right-aligned, Mono 19/700).
- A lane at zero replaces its time with `HER GO` / `YOUR GO` (Mono 13/700 in that colour) and its
  track fills 100%.
- **Together mode** collapses to a single lane spanning the full width, gradient fill
  `linear-gradient(90deg, var(--accent), var(--partner))`, one Mono 22/700 clock, labelled with both
  names.
- Control row: four equal buttons, `--surface2` fill, 1px border, radius 9px, padding `10px 0` —
  `−15s`, `Pause`, `+15s`, `Skip`. They act on **your** lane; long-press (or a second tap on a
  partner lane) targets the partner's.
- The dock is **only present while at least one lane is running**; it animates in with a 150ms
  height/opacity transition and never covers the body content (the body shrinks).

**Prev/next bar** — unchanged behaviour from today's `.focus-nav`: `Prev` (flex 1) and
`Next exercise →` (flex 2), min-height 52px, radius 11px. Next becomes `--accent` filled + the
existing `focus-next-ready` pulse when both participants have completed the exercise (keep
`exerciseDoneIn` logic; in v2 it must count *both sides* for per-side exercises).

### 2. Per-side set stepper (`1d`)

Replaces the single `▶ Start 30s` button for any exercise with `perSide: true` **and** a timed
target, and the paired reps entry for per-side rep exercises.

- **Step 1 — Left:** two-chip side indicator (`LEFT` active: `--accent-dim` bg, `--accent` text,
  Mono 12/700, radius 8px, `padding: 9px 0`; `RIGHT` inactive: `#17181a` bg, `--text-faint`).
  Primary button min-height 62px: `▶ Start left · 30s`. Caption Mono 11 `--text-faint`:
  `set 1 of 2 · 0 of 2 sides logged`.
- **Step 2 — switch sides:** heading Mono 11 `--accent` `STEP 2 · SWITCH SIDES`; achieved time
  Mono 34/700 `--accent` next to two-line 13px `--text-secondary` (`left logged` / `now the other
  side`); side chips flip; button `▶ Start right · 30s`; caption `no rest until both sides are done`.
- **Completed / re-opened set:** two rows, each bg `#17181a`, 1px `#24262a`, radius 12px, padding
  `12px 14px`: side label (Mono 12 `--text-faint`, width 52px), achieved value (Mono 19/700), and a
  **`↻ Redo`** button (`--surface2`, 1px `#33363c`, radius 9px, padding `10px 12px`, Sora 12/600)
  which re-arms the countdown for that side only and overwrites only that number.
- Rest starts **after the second side** is logged (or after the merged set in together mode).

### 3. Workout overview v2 (`1e`, left phone)

Replaces the current stacked date card + type buttons + safety banner + per-exercise loggers.

- Header: `Let's Get Buff` (Sora 17/800, `--accent`), build badge Mono 11 `--text-faint`, E-ink chip
  (pill, `--surface2`, 1px border, padding `5px 10px`, Mono 11).
- Title: `Workout B` Sora 28/800 (-0.8px) + `Pull & Quad` 15 `--text-secondary`.
- Meta chips row, Mono 11: `SAT 29.08`, `WEEK 1/26`, `8 EXERCISES` (bg `#17181a`, 1px `#24262a`,
  radius 7px, padding `6px 9px`). The date picker moves behind the first chip (tap to change).
- **Training** card: `TRAINING` Mono 11 caption, then a pill per participant — `You` in
  `--accent`/`--accent-dim`, partner in `--partner`/`--partner-dim` `#1d2a12`, radius 999px, padding
  `6px 11px`, 12/700 — and a `change` text button that opens the existing `StartSessionModal`.
- **Warm-up** card: caption `WARM-UP · 11 MIN` + `0/4`; then one tile per parsed step (from the
  existing `parseWarmup`), each `flex: 1`, bg `#17181a`, radius 10px, padding `10px 8px`, centred:
  Mono 15/700 duration over 11px `--text-faint` label (`row`, `plank`). Tapping a tile starts the
  existing `ExerciseTimer`.
- **Start session** button: full width, min-height 66px, `--accent`, radius 14px, Sora 19/800,
  `▶ Start session`.
- **Order** list: caption `ORDER` + right hint `drag · live with <partner>`; rows bg `#17181a`, 1px
  `#24262a`, radius 12px, padding `12px 14px`, gap 10px: `⠿` handle (`--text-faint` 15px, keep the
  existing dnd-kit sensors and `useLiveOrder` reorder), index Mono 12, name Sora 14/600, and right
  side Mono 11 `--text-faint` `3×10 · turns` (target + remembered rest mode). Rows below the fold
  render at `opacity: 0.55`.
- The safety banner, "felt easy", notes/alternatives and `Mark Workout B done` all move **into**
  focus mode / the finish step; the overview keeps only what you need before starting.

### 4. Today card (`1e`, right phone)

- Date caption Mono 11 letter-spacing 0.12em `SATURDAY 29 AUGUST`.
- Hero card bg `#17181a`, 1px `#33363c`, radius 18px, padding 16px: `Workout B` Sora 30/800 +
  `Pull & Quad` 14; participant pills + Mono 11 `~55 min`; primary button min-height 64px,
  radius 13px, Sora 18/800 `▶ Start Workout B`.
- Two secondary tiles side by side (`Stretch`, `Home circuit`): bg `--surface`, radius 14px, padding
  14px — title 14/600, Mono 11 sub, then a `--surface2` button `padding: 11px 0`, radius 10px.
- **This week**: caption + `1 of 2 done`; 7-column grid, gap 5px; cell bg `#17181a`, 1px `#24262a`,
  radius 9px, padding `9px 0`, centred: 11px day initial over Mono 12 marker (`A ✓`, `B`, `·`).
  Today's cell: `--accent-dim` bg, 1px `--accent`, both lines `--accent`.
- `Add a run, ride or rest day` row with a `+ Add` button → the existing `AddActivity` control.

### 5. E-ink (`1f`) — hard requirement

- No rings, no gradients, no colour-carried meaning, no transitions (the existing
  `[data-theme="eink"]` layer already kills animation).
- **You** = solid black card (`#000` bg, `#fff` text). **Partner** = white card with a hatched fill
  `repeating-linear-gradient(135deg,#fff,#fff 6px,#e2e2e2 6px,#e2e2e2 12px)`. Both 2px `#000`
  border, radius 8px (`--radius` is 4px in eink; the cards may use 8px).
- Countdown is the biggest thing on screen: Mono **64px/700** for the active lane, `GO NOW` at
  Mono 40/700 for a finished lane.
- Every control: 2px `#000` border, min-height 56px, radius 6px, Mono or Sora 15/700, uppercase.
- States spelled out in words: `RESTING`, `GO NOW`, `TAKING TURNS · 90s`, `DONE`.

---

## Interactions & behaviour

**Rest lanes**
- Confirming your set starts **your** lane only, at the exercise's rest length. Confirming in
  *together* mode starts one shared lane; a second confirm inside an already-running shared window
  **joins** it rather than restarting it.
- Lanes are driven by wall-clock deadlines, exactly like the existing `useCountdown`
  (`endAtRef`, `visibilitychange` resync) — never by counting ticks. Two lanes = two independent
  deadlines; store them so a reload mid-rest restores both.
- On reaching zero: the existing `playTimerEnd` ding + `navigator.vibrate([200,100,200])`, lane
  flips to `GO`, and it keeps showing `GO` (no auto-dismiss) until that person logs their next set.
- `−15s` / `+15s` shift the remaining time only (`adjustAffectsTotal: false`, as today's RestTimer).
  `Skip` clears the lane. `Pause` freezes the deadline.
- Mute (`letsgetbuff-mute`) and rest length (`letsgetbuff-rest-secs`, plus the band-aware
  150s/90s default) behave exactly as today.

**Rest mode per exercise**
- First visit defaults from the plan: `progressionType === 'timed'` or `safetyCues.includes('back')`
  core work → `together`; everything loaded (`requiresKg: true`) → `turns`.
- The user's choice is written to `localStorage['letsgetbuff-rest-mode']` as
  `{ [exerciseId]: { mode: 'together' | 'turns', secs?: number } }` and reused next session. Solo
  sessions ignore the mode entirely (one lane, no labels).

**Per-side sets**
- A set is complete only when both sides have a value. `exerciseDoneIn` must be extended for v2 to
  require `2 × target.sets` side-values on `perSide` exercises. Persist the two halves inside the
  existing `SetEntry` shape — either as two consecutive `SetEntry` items (preferred: no schema
  change) or an added optional field; **whichever you choose must round-trip through the existing
  JSON export/import unchanged**.
- `↻ Redo` on a finished side re-arms the countdown for that side and overwrites only that value.

**Re-opening any logged set**
- Shows the logged value plus a restart/edit control — never an empty state, never a set that
  cannot be re-timed (this is the reported bug).

**Solo behaviour**
- One lane, no name labels, no partner row, no rest-mode switch (the dock shows a single amber lane).
  The layout must not leave a gap where the partner row was.

**Live session**
- Keep `useLiveOrder` (WebSocket reorder + presence) and the existing session resolution
  (`/api/session`, `StartSessionModal`). Presence now also drives the partner row's
  `set N of M` line when the partner is on their own device.

## State

New (device-local only):
- `letsgetbuff-ui-v2` — `'1' | '0'`, the feature flag.
- `letsgetbuff-rest-mode` — per-exercise `{ mode, secs }` map.
- `letsgetbuff-rest-lanes` — in-flight lane deadlines `{ [username]: { endAt, total, paused } }`,
  so a reload mid-rest restores both countdowns. Cleared when the session ends.

Unchanged: `AppState` (sessions/entries/activities), `letsgetbuff-mute`,
`letsgetbuff-rest-secs`, the offline mutation queue, and the server session/WS APIs.

## Design tokens

New/renamed tokens to add to `app.css` for all three themes:

| Token | dark | light | eink |
| --- | --- | --- | --- |
| `--bg` | `#0a0a0b` | `#f5f5f5` | `#ffffff` |
| `--surface` | `#131416` | `#ffffff` | `#ffffff` |
| `--surface2` | `#202226` | `#ebebeb` | `#e6e6e6` |
| `--surface-raised` | `#17181a` | `#f7f7f7` | `#ffffff` |
| `--border` | `#2c2f34` | `#d0d0d0` | `#000000` |
| `--border-strong` | `#33363c` | `#b4b4b4` | `#000000` |
| `--text` | `#ecedee` | `#111111` | `#000000` |
| `--text-secondary` | `#9aa0a6` | `#555555` | `#1a1a1a` |
| `--text-faint` | `#8b9196` | `#6b6b6b` | `#1a1a1a` |
| `--accent` (you) | `#e8a020` | `#c47a00` | `#000000` |
| `--accent-dim` | `#3a2a06` | `#fdf0d5` | `#d6d6d6` |
| `--partner` | `#7fd14b` | `#3f8a1f` | `#000000` |
| `--partner-dim` | `#1d2a12` | `#eaf6e2` | `#e6e6e6` |

Radii: 6 / 7 / 9 / 10 / 11 / 12 / 14 / 16 / 18 / 999px (chips 7, controls 9–12, cards 14–18).
Spacing: 4 / 6 / 8 / 10 / 12 / 14 / 16px. Hit targets ≥ 48px; primary actions 60–66px.

Typography — **two new webfonts** (self-host or add to `index.html`; keep `system-ui` as fallback):
- **Sora** — all UI text. 40/800 page titles, 30/800 & 28/800 screen titles, 26/700 exercise name,
  19/800 & 17–18/700 primary buttons, 15/600–14/600 labels, 13/600 secondary buttons, 12/600 chips.
- **JetBrains Mono** — every number and every micro-caption. 64/700 & 56/700 e-ink countdown,
  34/700 achieved time, 22–24/700 clocks, 19/700 lane clock, 21–22/700 inputs, 15/700 warm-up
  tiles, 12–13 meta, 11 captions (letter-spacing 0.06–0.14em on uppercase captions).

Minimum text size anywhere: 11px. Numbers always use `font-variant-numeric: tabular-nums`.

## Assets

None new. Exercise videos keep coming from `videoUrls` in the plan catalog via the existing
`YouTubeEmbed` / `VideoPanel` (lite embed). The `▶`, `✓`, `↻`, `⠿` glyphs are text characters, as
today. No icon library is needed.

## Files

- `Workout Redesign.dc.html` — the design reference (canvas; sections `1a`–`1f`).
- `PROMPT.md` — a ready-to-paste prompt for Claude Code, including the flag work and a phase plan.

Source files in the app that this design replaces or touches:
`client/src/views/WorkoutView.tsx`, `client/src/views/HomeView.tsx`,
`client/src/components/workout/{FocusMode,ExerciseLogger,timers,helpers}.tsx|ts`,
`client/src/components/CountdownTimer.tsx`, `client/src/store/einkMode.tsx` (as the pattern for the
new provider), `client/src/app.css`, `client/src/components/settings/preferenceCards.tsx`.
