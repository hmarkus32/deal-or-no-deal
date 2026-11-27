# Brief 03: Fix the phone link and PR #4 glitches

Branch: `codex/fix-pass`. Open a PR into `main` and **do not merge**.
Read `AGENTS.md` and `docs/CONTEXT.md` first. Live `main` is `0a5df4b` (PR #4). The last build where Hunter said the phone link felt smooth is `d150489` (PR #3). Work only on this brief. Keep it lean, keep the no-scroll / no-CDN / no-secrets rules, and do not weaken the DEAL / NO DEAL stingers or the lid-open reveal — repair them.

## Diagnosis (already investigated; start here)

PR #4 did not touch PeerJS or the transport in `link.js`. A full single-screen game and a fake-PeerJS linked game both complete in headless Chrome with **no page errors**. The likely live break is a **deadlock**, not a broker outage.

1. **`hold` deadlock with a stale phone page (most likely).** PR #4 added a `hold` phase (`selectCase` during `open` now goes to `hold`, not `reveal`). In linked mode the stage shows a sealed case, **hides the Open-case button**, and **does not auto-open**. The new `phone.js` shows a big Open-case button. The pre-PR-4 `phone.js` (`d150489`) has no `case 'hold'` in its `switch`, so it renders a heading but **empty controls**. After the Pages deploy, Safari or the 10-minute Pages cache can keep serving that old `phone.js`. The devices still show “Linked”, but neither side can open the case, so the game and the remote feel broken. Removing `hold` also restores compatibility with that cached phone file, which already understands `reveal` / `Continue`.
2. **Uncaught audio in `transition()` / `render()` can desync the link.** `playSting`, `playRevealCue`, and `heartbeat()` run inside `transition` / `callEffects` with no `try/catch`. `cue()` uses `start()` + `stop(time)` and exponential ramps; `silence()` calls `disconnect()` without a guard (it races `onended`). If iOS Safari throws (`InvalidStateError` on a late `stop`/`start` or a past ramp), `render()` never reaches `publish()`, and an exception in the `serve()` command path is also uncaught. The first mid-game case is when heartbeat + reveal first run with a running `AudioContext`. Wrap all Web Audio so a sound failure can never block UI, snapshots, or PeerJS `on('data')`.
3. **`silence()` on leaving `hold` immediately kills the reveal cue** that `playRevealCue()` just started, which clips the open sound into a click. That is why case-open SFX are weak or harsh.

## Required fixes

### 1. Remove the heartbeat
Delete the hold heartbeat interval and `heartbeat()` (Hunter: it sounds like “someone banging a golf club on a cat”). Do not replace it with another thump or pulse. A very soft, non-rhythmic tension pad is optional; silence during a sealed case is better than a bad sound.

### 2. Same briefcase art, TV-show lid
The big suspense/open case must use the **same silver/grey briefcase** as the board tiles (`.case-face` default), not `.gold-case`. Gold stays only on the contestant’s held case, as today. When the case opens, the lid hinges at the back and swings **up / top-down**, like the TV show — not a gold recolor and not a side flap. Keep the existing interior + amount slam, just make the lid and color right. Mid-game `revealScene(..., true)` currently forces gold; stop doing that for non-held cases.

### 3. Never auto-open the contestant’s own case
After DEAL, and after Keep/Swap, the stage must show **that case still sealed**, with no amount and no reveal sound, until Hunter taps **“Open my case”** (phone when linked, stage when not). Only then play the lid-open reveal and sound. Then continue with the existing “Open case #N” (the other case) / “Show result” flow. Do not skip this on the DEAL path because the stinger just ran. Pick a lean implementation (flag or a short phase). Redact the amount from the snapshot until it has been opened. Give the stage a fallback button so a stale phone page cannot deadlock this the way `hold` did.

### 4. Picking a case opens it now; then wait for Continue
- Mid-game: selecting a case **opens it immediately** (show the lid + amount + sound). **Never** label a button “Open case”. Remove the `hold` phase from the live flow, the 1.5 s auto-open, and the “The host will open the case…” copy.
- After the reveal, **do not auto-advance**. Wait for **Continue** (phone when linked, stage when not). Remove the 1.4 s `schedule()` auto-`finishReveal`. Linked mode may keep Continue on the phone only, but the stage must still have a Continue fallback if the phone is missing or stale.
- `openCase` can go if unused; update `game-logic.js`, `link.js`, `phone.js`, `host.js`, and tests so playthroughs are `selectCase` → `continue` again.

### 5. Redo the sound effects
Audit every cue (DEAL slam, NO DEAL boom, case-open ding for low amounts, groan/thud for high amounts, banker ring). They must sound tasteful on an iPad speaker: proper attack/decay envelopes, no clicks, no harsh transients, no tiny 0-duration beeps. Fix the `silence()` clash that cuts the open sound. Keep DEAL and NO DEAL clearly different (gold/bright vs red/low). Respect mute and the existing first-gesture unlock (`pointerdown`/`click` is fine). Wrap every audio path in `try/catch`. Prefer `setValueAtTime` + ramps that cannot throw if `currentTime` has moved (do not `stop()` in the past; do not `exponentialRamp` from 0).

### 6. Bug-scan, especially the phone link
Scan `host.js`, `link.js`, `phone.js`, and `game-logic.js` for anything that can break pairing, snapshots, reconnects, or iOS Safari. At least:
- Audio must never throw into `transition`, `render`, `callEffects`, or the `serve()` command handler. `silence()` must be safe if a node already stopped.
- A phone page that does not recognize a new phase must not be able to freeze the game (stage fallback, or don’t add a required new phase).
- After NO DEAL, the phone already moves to the next round while the 2 s stinger is up; that is OK, but picking a case must not break state, and `clearSting()` must stay safe.
- Confirm reconnect (refresh the phone mid-game) still gets a current snapshot and can Continue / Answer / DEAL as appropriate.
- Do not change the PeerJS broker, vendored PeerJS, or the room-code/QR pairing unless a real bug requires it.

## Acceptance criteria
1. No heartbeat (or any golf-club-on-a-cat thump). Other cues sound clean on a device speaker, including case open, and stay silent when Sound is off.
2. Mid-game and final open cases use board-silver art; the contestant’s held case can stay gold. Lids open top-down, hinge at the back.
3. After DEAL or Keep/Swap, the contestant’s case stays sealed until “Open my case”. The amount is not visible on stage or phone before that tap.
4. Selecting a mid-game case opens it at once. No button ever says “Open case”. Continue is required; nothing auto-opens or auto-continues mid-game.
5. A full single-screen game (no-deal to swap + keep, and a mid-game deal) and a full fake-linked game complete with no console errors. Mid-game: pick → reveal → Continue → … → call → answer → hang up → DEAL/NO DEAL. End: Open my case → (other case if needed) → Show result.
6. Fake-linked reconnect still works. An old `d150489` mental model of the phone (no `hold`) must not be required, and must not deadlock if a cache keeps it briefly: mid-game flow is `reveal`/`continue` again, and final “Open my case” has a stage fallback.
7. No scrolling at iPad (1024×768) or TV (1920×1080). Stingers still play and still respect `prefers-reduced-motion` (no shake).
8. `node --test` passes, with tests updated for the removed `hold` flow and for “Open my case” not revealing early (snapshots withhold that amount until opened).

## Tests
```
node --test
```
