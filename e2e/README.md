# E2E suite — cross-browser, touch and audio-path checks

Run **on demand before major features ship**, not on every push (the deploy
pipeline stays vitest + node:test only).

```
npm run e2e                                   # build + all four profiles
npx playwright test --project=iphone-webkit   # just the iPhone profile
npx playwright show-report                    # open the HTML report
```

In CI: GitHub → Actions → **E2E (on demand)** → Run workflow.

## What it covers

- **Engines**: Chromium, Firefox, WebKit (Safari's engine), plus an iPhone 13
  profile (WebKit + iOS UA + touch) so the app's `IS_IOS` branches run for real.
- **Boot + auth**: production build served by the real Fastify server against
  throwaway DBs (`e2e/.tmp`, created fresh each run — real data never touched;
  login `e2e` / `testpassword123`).
- **Guest invariant**: every tab renders, zero non-GET API requests.
- **Touch**: taps (not clicks) drive the nav and the explain-why chips.
- **Audio paths** (the v53 iPhone fixes): sound preview and timer-end must go
  through an `<audio>` element on iOS (ringer-switch-proof), the AudioContext
  must end up `running` after a start gesture, and sessions must request a
  screen wake lock. Asserted via init-script recorders — no machine can assert
  audibility, and the hardware ringer switch / lock screen only exist on a real
  phone, so a quick manual check there still matters after audio changes.

First local run: `npx playwright install chromium firefox webkit` (downloads
the engines once). Windows Firewall may prompt about the new browser
executables — everything binds to 127.0.0.1, so allowing or blocking both work.

Known engine quirk: Playwright's WebKit builds ship **without Web Audio**
(`AudioContext` is undefined) — which is exactly how this suite caught v54's
fix (a missing AudioContext used to mean silent, or crashed, timers). The
"context running" test auto-skips there; the element-route tests are the
meaningful audio coverage in WebKit.
