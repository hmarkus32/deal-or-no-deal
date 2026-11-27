# Brief 02: Dramatic banker call + linked host phone

Branch: `codex/host-phone-link`. Open a PR into `main` and **do not merge**.
Read `AGENTS.md`, `docs/CONTEXT.md`, and `docs/briefs/01-game.md` first. This brief builds on the live v1 game
(`index.html`, `host.js`, `game.css`, `game-logic.js`, `tests/game.test.js`). Keep its look, its no-scroll rules,
and everything that already works. If this brief and CONTEXT conflict, this brief wins.

Naming note: in the current code, `host.js` is the **stage** controller (the page the room watches). In this brief,
"stage" means `index.html` + `host.js`, and "host phone" means Hunter's phone remote. Do not rename `host.js`.

## Goal
1. Make the banker call dramatic, like the Jeopardy "time's up" flash.
2. Add an optional **linked two-device mode**: the iPad/TV shows the stage, and Hunter's phone is a private
   banker phone and remote control. He answers the banker on his phone, sees the offer privately, "hangs up" to
   reveal it on the stage, then holds DEAL / NO DEAL out to the contestant on his phone.
3. Single-device mode (today's game) keeps working exactly as now, fully offline, when no room is used.

## Part 1: Dramatic banker call (both modes)
- When the game enters the banker call, a **pulsing red border flashes around the whole viewport** (a fixed,
  pointer-events:none overlay above the page, e.g. a thick inset red `box-shadow`/border with a glow), and the stage
  background **washes red** (tint the radial-gradient stage toward deep red). Pulse at roughly the ring cadence
  (about 2–3 pulses per second) and keep it going for the whole ringing **and** "on the line" period. It stops
  when the offer is revealed.
- Sync with the existing Web Audio ring (`ring()` in `host.js`): the pulse starts when the ring starts. Right now
  `ring()` plays one 4-burst ring once. Repeat that ring pattern about every 2 s while the phase is ringing, and stop it
  on Answer. It must ring **once per call entry**, never stack up overlapping rings because of re-renders or incoming
  state syncs (`renderGame()` calls `ring()` on every render today; fix that).
- **Mute still works**: when Sound is off, there is no audio but the full visual cue remains. The existing rule that
  audio is unlocked by a click stays.
- **Reduced motion**: with `prefers-reduced-motion: reduce`, show a **steady** red border and a static red wash, with no
  pulsing. Note that `game.css` already has a blanket `animation:none !important` reduced-motion rule, so the steady
  border must come from the base (non-animated) style, not from a keyframe.
- The red overlay must not cover or block buttons, must not cause scrolling, and must look right at all four viewports.

### New call flow (both modes): Answer → on the line → Hang up
Today the `call` phase auto-advances to `offer` after 1.55 s (`schedule()` in `host.js`) or on "Answer call". Replace
that with an explicit three-step call. **The call phase must no longer auto-advance.**
1. `call` (ringing): stage heading "The Banker is calling…", ringing phone icon, red pulse.
2. `line` (new phase, answered): heading "The Banker is on the line…", red pulse continues, **no amount shown on the stage**.
3. `offer`: the offer is revealed with a dramatic rise (reuse the existing `.amount` rise animation used for case reveals),
   then DEAL / NO DEAL as today.

- **Single-device mode**: the stage shows a big **Answer** button in `call`, then a big **Hang up** button in `line`.
  The amount is hidden until Hang up.
- **Linked mode with the host phone connected**: Answer and Hang up are on the **phone**, and the stage shows only the
  drama (see Part 2).
- Game logic: add pure transitions to `game-logic.js`, for example `answerCall(game)` (`call`→`line`) and
  `hangUp(game)` (`line`→`offer`). Keep `showOffer` working for old saves (it can stay as `call`→`offer` or delegate). Wrong-phase calls
  return the game unchanged, like every other transition. A saved game in `call` from v1 must still load and continue.
  If you keep the `dond-state-v1` key, old saves must load; if you change the state shape, bump to `dond-state-v2` and say why.

## Part 2: Linked two-device mode

### Two links
- **Stage link** (iPad on the TV): the existing `https://hmarkus32.github.io/deal-or-no-deal/`. It gains a
  **"Link host phone"** action on the title screen and in the ••• game menu, so a game already in progress can be linked.
  It opens a panel/dialog that shows:
  - a short **room code** (4 characters, readable alphabet with no 0/O/1/I/L, shown huge);
  - the full **host URL** (e.g. `https://hmarkus32.github.io/deal-or-no-deal/phone.html?room=K7QX`);
  - a **QR code** of the host URL **only if** you generate it without network calls (write a small encoder yourself or
    vendor a small MIT-licensed encoder into `vendor/` with its license). If that's not reasonable, skip the QR and say so in the PR.
  - a **Stop linking** action (with confirm), which returns to single-device mode without disturbing the game.
- **Host link** (Hunter's phone): `phone.html?room=CODE` (new page + `phone.js`, reusing `game.css` and
  `game-logic.js` for formatting). Also accept `index.html?role=host&room=CODE` by redirecting to `phone.html?room=CODE`.
  If `phone.html` is opened without a room, it shows a big room-code entry field and a Join button.
- The stage remembers its room code in localStorage, so refreshing the stage keeps the same code and the phone can
  reconnect without re-entering it.

### Roles and source of truth
- **The stage is the single source of truth.** It owns the game state (the same localStorage state as today) and applies
  every change through the pure `game-logic.js` transitions.
- **The host phone is a remote.** It sends **commands**. It never edits game state itself. It renders only from the
  latest **snapshot** the stage sends.
- After every state change, and whenever a phone (re)connects, the stage sends a snapshot: phase, round, label/heading
  text the phone needs, chosen case, opened cases, remaining count, current offer, result, and a monotonically increasing
  `rev`. **Redact unopened case contents** from the snapshot (only opened/revealed cases carry amounts), so the phone
  can never show what's in a sealed case. The current offer amount is included in `line` and later phases (that's how
  the phone shows it privately).
- Commands carry the phase they were sent from (e.g. `{type:'cmd', action:'hangUp', phase:'line', rev:42}`). The stage
  ignores a command whose phase doesn't match the current phase (stale or double-tapped), then re-sends the current
  snapshot. Commands are idempotent through the existing wrong-phase guards.
- Command set (map each to an existing or new pure transition): `selectCase(n)`, `continue` (finish a reveal early, like
  the existing Continue button), `answer`, `hangUp`, `deal`, `noDeal`, `keep`, `swap`, `openOther`, `showResult`.
  Play Again, New Game, and Setup stay **stage-only** (they're destructive and already have confirms there).
- If a stage confirm/menu dialog is open, apply host commands anyway, but close the stage menu dialog first so the
  existing `dialog.open` guards in `advance()`/`schedule()` don't stall the game.
- Only one host phone at a time: a new phone connection replaces the old one.

### Host phone screens (all must fit 390×844 with no scrolling)
- **Header**: game title, a **connection status pill**, and the round label.
- **Compact case grid** of 26 small cases for `pick` and `open` phases, so Hunter can pick for players. Held and opened
  cases are shown like the stage (opened ones dimmed/disabled). Taps send `selectCase`. Case picking also still works by
  touching the iPad.
- During a case reveal: "Opening case #N…" with a Continue button.
- **`call`**: full-screen ringing banker phone with the red pulse and a huge green **Answer** button. Vibrate with
  `navigator.vibrate` where supported (it isn't on iPhone; that's fine). Optional quiet ring on the phone with its own
  mute toggle. The phone can't play sound until it's been tapped once, so don't rely on it.
- **`line`**: "The Banker" call screen showing the **offer amount big, only on the phone**, a call timer counting up,
  and a huge red **Hang up** button.
- **`offer`**: huge **DEAL** and **NO DEAL** buttons stacked, filling most of the screen, plus the offer amount, so Hunter
  can hold the phone out to the contestant.
- **`swap`**: big **Keep #X** and **Swap for #Y** buttons.
- **Final reveal / other reveal / result**: the same next-step buttons the stage has (Open case #…, Show result), then
  the winnings and a "Game over, use the stage for Play Again" note.
- **Title / setup** (no game on the stage yet): "Waiting for the stage to start a game…".

### Stage behaviour in linked mode
- A **connection status pill** in the top bar (e.g. "Phone linked · K7QX" in green, "Waiting for phone · K7QX" in amber,
  "Link lost, playing on stage" in red). It must fit at 390 px wide without pushing the Sound/menu buttons off-screen.
- **While a phone is connected**: in `call`, `line`, `offer`, and `swap` the stage hides its Answer / Hang up / DEAL /
  NO DEAL / Keep / Swap buttons and shows a large cue instead ("Host has the Banker on the line…", "Deal or no deal?",
  "Keep or swap?"), so the room can't tap them. Case grid touches on the stage still work.
- **While no phone is connected** (never joined, dropped, or failed), the stage shows its normal single-device buttons,
  so the game can always be finished on the iPad alone.
- When a phone command plays DEAL / NO DEAL / Keep / Swap, the stage runs exactly the same screens and animations as a tap would.

### Reconnects
- If the phone locks, sleeps, or refreshes, it reconnects automatically (on `visibilitychange`/`online`/`pageshow` plus a
  retry with backoff), says "Reconnecting…" in its pill, and on reconnect the stage sends the current snapshot, so the
  phone lands on the correct screen (for example straight onto Hang up if the call was answered).
- If the stage refreshes, it re-registers the same room code and the phone reconnects. If the broker still holds the old
  id briefly (PeerJS `unavailable-id`), retry for about 15 s before giving up and showing a clear error with a "New code"
  option.
- A heartbeat (ping every ~5 s, drop after ~15 s silence) keeps both pills honest.

### Transport
- Use **WebRTC data channels via PeerJS** with its free public cloud broker (`0.peerjs.com`, PeerJS's defaults including
  its default STUN/TURN servers). No account, no API key, no secrets, no other servers.
- **PeerJS is already vendored** at `vendor/peerjs.min.js` (v1.5.5, MIT, license in `vendor/PEERJS-LICENSE`).
  Load it with a plain `<script>`; do not use a CDN and do not replace the file. The stage must load it **lazily, only
  when "Link host phone" is used** (or when a saved room is being resumed), so single-device mode makes no network
  requests at all. `phone.html` may load it directly.
- Peer ids: stage = `hmarkus32-dond-<CODE>` (lower-case), phone = random id from PeerJS. The room code maps 1:1 to the stage
  id. If an id is taken by someone else when creating a **new** room, generate a new code.
- If PeerJS can't load, the broker is unreachable, or a direct connection fails (e.g. strict NAT), show a **clear error**
  on both devices ("Couldn't link the phone. Keep playing on the iPad.") and keep the stage fully playable on its own.

### Code structure
- `game-logic.js` stays **pure** (no DOM, no network). Only add the new call transitions.
- New `link.js` (classic script, `window.DONDLink` in the browser, `module.exports` in Node), split into:
  - **pure protocol** parts: room-code generation/validation, peer-id mapping, snapshot building + redaction,
    command validation, and `applyCommand(game, cmd) → game` using `DOND` transitions;
  - a small **transport adapter** that wraps PeerJS behind an interface (`send`, `onMessage`, `onOpen`, `onClose`), so
    tests can inject a fake transport.
- `host.js` (stage) and `phone.js` (host phone) use `link.js`. Keep all PeerJS calls inside `link.js`.

## Acceptance criteria (check and report each in the PR)
1. `node --test` passes locally and in CI with no installs. The 11 existing tests still pass unchanged or are only extended.
2. New tests cover: `answerCall`/`hangUp` (right phase advances, wrong phase is a no-op, v1 `call` saves continue);
   room-code generation (length, alphabet, no ambiguous characters) and peer-id mapping; snapshot redaction (no sealed case
   amounts ever in a snapshot, offer amount present only from `line` on); every command maps to the right transition and
   stale/wrong-phase/unknown/malformed commands are ignored; and a **fake-transport** end-to-end test where a fake stage
   and fake phone play a full game (pick → open rounds → call → answer → hang up → no deal … → swap → result, plus a deal
   path), including a simulated phone disconnect + reconnect mid-call that resyncs from the stage snapshot.
3. Banker call: the pulsing red border and red wash show in `call` and `line`, start with the ring, and stop at the offer
   reveal. With Sound off, no audio plays but visuals remain. The ring plays once per call entry and repeats every ~2 s
   while ringing, without overlapping. With reduced motion, the border is steady red.
4. The call phase no longer auto-advances. In single-device mode, Answer → "on the line" (no amount on screen) → Hang up →
   offer reveal works on one screen.
5. Single-device mode works exactly as before otherwise: full games in all four paths (deal round 1, deal mid-game, no deal +
   keep, no deal + swap), refresh-resume, setup and presets, confetti. **Zero network requests** in single-device mode
   (DevTools Network: PeerJS is not even loaded) and it works offline after load.
6. Linked mode: the stage shows the room code, the full host URL (and QR if done). Opening the host URL on a second device
   links it and both pills show "linked". The full flow works: ring on the stage → Answer on the phone → offer only on the
   phone while the stage says the Banker is on the line → Hang up reveals the offer on the stage → DEAL/NO DEAL on the phone
   plays on the stage → final Keep/Swap on the phone. Case picks work from both the phone grid and the iPad.
7. While the phone is linked, the stage hides the call/offer/swap buttons. When the phone drops, they come back within
   ~15 s and the stage can finish the game alone.
8. Reconnect: locking or refreshing the phone mid-game (including during `line`) reconnects it onto the correct screen with
   no state change on the stage. Refreshing the stage keeps the same room code and the phone reconnects.
9. Failure: with the network blocked or PeerJS failing, a clear error shows and the stage stays playable.
10. No scrolling and no clipping: the **host phone** view in every phase at **390×844**; the **stage** in every phase
    (including the red call, `line`, the link panel, and linked-mode cues) at **390×844, 1024×768, 1366×768, and 1920×1080**.
    Check `scrollHeight <= clientHeight` and `scrollWidth <= clientWidth`, and report how you checked each.
11. All phone buttons are at least 44×44 CSS px. Answer, Hang up, DEAL, and NO DEAL are huge (at least about 25% of the
    screen height each for Answer/Hang up; DEAL and NO DEAL together fill most of the screen).
12. No secrets, accounts, analytics, CDNs, or third-party calls besides the PeerJS broker and its WebRTC STUN/TURN, and those only in
    linked mode. `vendor/peerjs.min.js` is unchanged.
13. The PR description follows AGENTS.md, goes through these criteria one by one, and lists the tests added, with the local
    `node --test` output pasted. Note that a real two-device WebRTC test can't run inside your sandbox (no internet), so say
    exactly what was verified with fake transports and what the reviewer must check on real devices.

## Do not touch
- `AGENTS.md`, anything in `docs/`, `ci/ci.yml`, `.github/`, and `vendor/peerjs.min.js` / `vendor/PEERJS-LICENSE`.
- `README.md`, except to add a short "Linking a host phone" section.
- No other repositories.
