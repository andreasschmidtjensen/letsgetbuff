# Prompt for Claude Code

Read `design/workout-v2/README.md` in full, then open
`design/workout-v2/Workout Redesign.dc.html` in a browser. Section **1a** is the chosen
design; **1d**, **1e** and **1f** are also in scope; **1b** and **1c** are rejected alternatives —
ignore them. Also read `CLAUDE.md` and honour every hard invariant in it, in particular: JSON
export/import must keep round-tripping old backups, guest mode writes nothing, and `/api/health`
`version` gets bumped every phase.

We are adding a second version of the gym-workout UI — "focus mode v2", built around a two-lane
**rest dock** so two people on one phone can rest in parallel or take turns. The old UI must stay
fully working and be one tap away, because I will be trying this out mid-workout and need to fall
back instantly if it misbehaves.

**Non-negotiables**

1. **Feature flag first, everything else after.** `localStorage['letsgetbuff-ui-v2']`, a
   `uiVersion` provider modelled exactly on `store/einkMode.tsx`, a `?ui=v2` / `?ui=v1` URL
   override, a Settings preference card, a `⚡ New / Classic` chip in the workout overview header,
   and a "Switch back to the classic workout screen" button in `ErrorBoundary` when v2 is on.
   Flipping the switch must re-render in place: it must not end the session, navigate, or lose
   in-flight rest countdowns.
2. **Do not touch v1 code** beyond the three branch points named in the README
   (`WorkoutView` overview, `WorkoutView` focus render, `HomeView` today card). New code lives in
   `client/src/components/workout/v2/`. Reverting the feature = flipping the flag; reverting the
   commit must not require untangling v1.
3. **Same data, no schema change.** Both versions write through the same reducer actions and
   `sendProxyLog`. No `SCHEMA_VERSION` bump, no migration ladder step. A session started on v2 must
   be completable on v1 and vice versa. If the per-side set values cannot be expressed with the
   existing `SetEntry` shape, choose the option that keeps export/import byte-compatible and prove
   it with a test that exports on v2 and imports on v1.
4. **Rest lanes use wall-clock deadlines**, like the existing `useCountdown` (`endAtRef` +
   `visibilitychange` resync) — never tick counting. Persist in-flight lane deadlines to
   `localStorage['letsgetbuff-rest-lanes']` so a reload mid-rest restores both countdowns.
5. **E-ink is a hard requirement**, not a follow-up. Person identity in e-ink is label + solid vs
   hatched fill, never hue; countdown at 64px; controls 2px-bordered and ≥56px tall. Verify with
   the e-ink toggle after every phase.
6. Two new webfonts (Sora, JetBrains Mono) with `system-ui` fallback. Keep the PWA/offline story
   intact — self-host or preload; do not let a font fetch block first paint on gym wifi.

**Phase it, and stop after each phase so I can try it:**

- **Phase A — flag plumbing.** Provider, URL override, Settings card, overview chip,
  ErrorBoundary escape hatch. v2 renders a placeholder. Bump `/api/health` version. Tests: the flag
  round-trips, the URL override wins, guest mode still writes nothing.
- **Phase B — tokens + focus shell.** New tokens in `app.css` for dark/light/eink, fonts,
  `FocusModeV2` shell (header, body, prev/next), current-set-large card with done-set chips, solo
  behaviour only. No dock yet — rest still uses the existing overlay.
- **Phase C — the rest dock.** `RestDock` + `useRestLanes`: one lane per participant, together/turns,
  merged lane, GO state, ±15s / Pause / Skip, deadline persistence, ding + vibrate. Per-exercise
  mode memory in `localStorage['letsgetbuff-rest-mode']` with the plan-derived defaults from the
  README. Tests for lane independence, join-don't-restart in together mode, and restore-after-reload.
- **Phase D — per-side sets + the re-open bug.** `SideSetStepper` (Left → switch → Right, `↻ Redo`),
  `exerciseDoneIn` extended for per-side, and a re-opened set that always shows its logged value
  plus a way to re-time it. Add a regression test for the current bug: re-open a completed timed rep
  → a timer is available.
- **Phase E — overview v2 + today card.** `WorkoutOverviewV2` (participants, warm-up tiles, order
  list with the existing dnd-kit + `useLiveOrder`, one big Start) and the redesigned Today card.
- **Phase F — polish pass.** Contrast check against the token table (captions ≥ 4.5:1, minimum text
  size 11px), 48px minimum hit targets, tabular numerals on every clock, and a final e-ink walk
  through every new screen.

Match the prototype's colours, sizes, weights, radii and copy as specified in the README rather than
inventing your own. Where the README and the HTML disagree, the README wins. Ask me before changing
anything about the server, the plan catalog, or the schedule engine — none of that is in scope.
