# Brief 01: Deal or No Deal, v1 (full game)

Branch: `codex/deal-or-no-deal-v1`. Open a PR into `main` and **do not merge**.
Read `AGENTS.md` and `docs/CONTEXT.md` first.

## Goal
Replace the placeholder `index.html` with a complete, polished, single-contestant **Deal or No Deal** game. It should feel like the TV show, be playable by a host casting a laptop Chrome tab to a TV, and let the host **edit the 26 money amounts** before each game. The default for the first party is a small-stakes "Family $100" board.

## Files
- `index.html`: the game (inline CSS and JS are fine).
- `game-logic.js`: **pure game logic with no DOM access**, written as a classic script that works both ways:
  - In the browser it attaches to `window.DOND` (loaded with a plain `<script src="game-logic.js">`, not a module, so it also works from `file://`).
  - In Node it exports via `if (typeof module !== "undefined") module.exports = ...`.
- `tests/*.test.js`: tests using `node:test` and `node:assert`, which `require('../game-logic.js')`. Delete or replace `tests/placeholder.test.js`.
- You may add other static assets, but **no** `package.json` dependencies, no build step, and no CDN.

## Game flow (classic single-contestant)
1. **Title/Start screen**: shows the game title (editable, default **"Deal or No Deal"**), a **Start Game** button, and a **Setup** button.
2. **Pick your case**: there are 26 numbered briefcases (1–26), each holding one of the 26 amounts, **shuffled with Fisher–Yates using `crypto.getRandomValues` when available**. The contestant picks one case, which moves to a "YOUR CASE" spot and cannot be opened.
3. **Open cases in rounds**: the schedule is **6, 5, 4, 3, 2, 1, 1, 1, 1** (24 cases total). Show "Round N: open X more cases". Opening a case plays a dramatic reveal: the lid opens and the amount appears big. The amount is then crossed out or dimmed on the money board with an animation.
4. **Banker's offer** comes after each round, 9 offers total. First there's a "phone ring" moment, a short ring synthesized with **Web Audio** (no audio files) plus a visual of a ringing phone or flashing "THE BANKER IS CALLING…". Then the offer is shown huge with two giant buttons, **DEAL** and **NO DEAL**.
   - **DEAL**: the game ends with that amount. Confetti plays, unless it was a bad deal compared to what the case held (see the reveal step).
   - **NO DEAL**: the next round starts.
5. **Final swap**: after the 9th offer is declined, exactly 2 cases remain, the player's case and one other. Offer: **"Keep your case #X or SWAP for case #Y?"**
6. **Final reveal**:
   - **If they played to the end**, open the chosen case and show their winnings. Then reveal the other case too, so you can show what they'd have had if they'd swapped.
   - **If they took a deal**, open their case dramatically to show what was inside, then show "You beat the Banker by $X" or "The Banker beat you by $X". Optionally, show what the remaining offers *could* have been. That's nice to have, not required.
   - Confetti plays on a "good" outcome, meaning the deal is at least the case value, or the winnings are in the top half of the board.
7. A **Play Again** button (keeps the same amounts and title) and a **New Game** button (with confirm) are available from any state.

## Money board
- **Two columns** of the 26 amounts, sorted ascending: the **low 13 on the left**, the **high 13 on the right**. In the show style, low amounts are blue/silver and high amounts are gold.
- Opened amounts get **crossed out or dimmed with an animation**. Amounts still in play stay bright.
- The board is visible during picking, opening, and offers. On iPhone portrait it may be compact, as a two-column strip or a collapsible panel, **but must not cause scrolling**.

## Banker offer formula (documented in code and unit tested)
`offer = roundNice( EV(remaining) × factor(round) × jitter )`
- `EV` is the mean of all amounts not yet revealed, **including the player's own case**.
- `factor(round)` rises across the 9 offers, roughly `[0.48, 0.56, 0.64, 0.72, 0.80, 0.88, 0.95, 1.02, 1.08]` (tuned up from `[0.30 … 0.98]` after the first family test so offers feel tempting). Keep it monotonic non-decreasing, starting in 0.40–0.55 and ending in 1.00–1.15. Late factors above 1 let the banker overpay, but the offer is always clamped to the largest amount still in play.
- `jitter` is a uniform random value in **[0.95, 1.05]**. The RNG must be injectable so tests are deterministic.
- `roundNice` rounds to nice numbers appropriate to the scale, so the offer looks like a real banker number:
  - under $1, round to the cent;
  - $1–$10, round to $0.05 or $0.25;
  - $10–$100, round to the whole dollar;
  - $100–$1,000, round to $5 or $10;
  - $1,000–$10,000, round to $50 or $100;
  - over $10,000, round to $500 or $1,000.

  The rule is that the offer must have no more than about 2–3 significant digits.
- The offer is **never below the smallest remaining amount** and **never above the largest remaining amount**. Clamp it.
- Put a comment block above the function explaining the formula.

## EDITABLE AMOUNTS (Hunter's explicit requirement)
**Setup screen**, reachable from the title screen and from a small gear or "Setup" button whenever a game isn't in progress:
- **Game title** text field, default "Deal or No Deal".
- **26 amount fields** in a grid. They accept input like `0.25`, `$1,000`, or `100` and parse to numbers.
- **Validation**: there must be exactly **26** values, all **positive**, all **unique**, and all finite numbers with at most 2 decimals. Show clear inline errors and block saving or starting until they're fixed. On save, amounts are **sorted ascending automatically**.
- **Presets** are stored in localStorage:
  - Six **built-in presets**, defined in `game-logic.js` as `DOND.PRESETS` and listed in this order in the picker. Picking one loads it right away, with no typing:
    1. **"Family $100" (DEFAULT)**. Tuned after the first family test so $20 tops the low column, for better odds:
       `0.01, 0.25, 0.50, 1, 2, 3, 5, 7, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 85, 100`
    2. **"Family $100 (Classic)"**, the original first-night default:
       `0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 100`
    3. **"Big Spender $100"** (very generous, top-heavy):
       `0.01, 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 72, 75, 78, 80, 85, 88, 90, 94, 97, 100`
    4. **"Kids $20"**:
       `0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 1, 1.50, 2, 2.50, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20`
    5. **"High Roller $500"**:
       `0.01, 1, 5, 10, 20, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475, 490, 500`
    6. **"Classic TV"**, the real show's values:
       `0.01, 1, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750, 1000, 5000, 10000, 25000, 50000, 75000, 100000, 200000, 300000, 400000, 500000, 750000, 1000000`
  - A browser whose saved setup is exactly the old default (now "Family $100 (Classic)") is moved to the new default once, on first load after the change (marker key `dond-default-board-v2`). Choosing Classic again afterwards sticks.
  - **Save current as preset** (named), **Load preset**, and **Delete** for user presets (with confirm). Built-ins can't be deleted.
  - **Reset to defaults** (with confirm) restores the default Family $100 amounts and the default title.
- The last-used amounts and title persist in localStorage and are used for the next game.
- Changing amounts mid-game is not allowed. Either Setup is disabled during a game, or it asks to end the current game first.

## Currency formatting (unit tested)
`formatMoney(n)`:
- Under $1, show cents: `$0.01`, `$0.05`, `$0.10`, `$0.25`, `$0.75`.
- Whole dollars have **no `.00`**: `$1`, `$100`, `$1,000`, `$1,000,000`.
- Non-whole amounts at or above $1 show 2 decimals: `$2.50`, `$12.75`.
- Use thousands separators.
- An optional compact form for tight spots, like `$1M` or `$750K`, may be used on small screens only if full text truly can't fit. Prefer full text.

## Presentation
- A TV-show feel: dark stage with a spotlight radial gradient, and **gold/silver briefcases** with the case numbers big and bold.
- A dramatic case-open reveal: the lid flips or slides, and the amount scales in.
- The banker phone-ring moment uses Web Audio. It's short, about 1–2 seconds, and plays only after a user gesture. Include a **mute toggle** that persists in localStorage.
- Confetti on a good deal or outcome, using canvas or DOM. Write it yourself, with no libraries.
- **Respect `prefers-reduced-motion`**: drop flips, confetti, and shakes in favour of simple fades or instant changes.
- **No external fonts, CDNs, or network requests.** It must work offline once loaded. Use system font stacks with heavy weights.
- Big readable text per `docs/CONTEXT.md`. The offer amount and revealed amounts should be very large, about `clamp(48px, 9vmin, 140px)`.

## Persistence
- Game state goes in localStorage under a **versioned key** (for example `dond-state-v1`). It includes the amounts, title, case assignments, the chosen case, opened cases, the round, offers made/declined, the phase, and the result.
- **Refresh at any point resumes the exact state.** If someone refreshes during a reveal animation, it's fine to land on the post-reveal state.
- Settings and presets go in separate keys (for example `dond-settings-v1` and `dond-presets-v1`).
- The **New Game** button asks for confirmation before wiping the game in progress.

## Acceptance criteria (each must be checked and reported in the PR)
1. `node --test` passes locally and in CI with no packages installed, and covers:
   - Shuffle assigns all 26 amounts to cases 1–26 exactly once. Tested with a seeded or injected RNG, plus a few random runs.
   - The round schedule equals `[6,5,4,3,2,1,1,1,1]` and sums to 24. After the schedule, exactly 2 cases remain unopened.
   - Offer formula, across many random states and rounds:
     - the offer is within [min remaining, max remaining];
     - with jitter fixed at 1, it equals `roundNice(EV × factor)`;
     - the factor is monotonic non-decreasing, starts in [0.40, 0.55], and ends in [1.00, 1.15];
     - the offer never exceeds the largest remaining amount, and average offers rise round over round;
     - offers on the Family $100 board are rounded sensibly.
   - Swap logic: swapping exchanges the player's case with the last remaining case, keeping gives the original, and the "what you would have had" value is correct.
   - Amount validation rejects:
     - 25 or 27 values;
     - duplicates;
     - zero or negative values;
     - NaN or blank entries;
     - more than 2 decimals.

     It accepts every built-in preset, and it sorts ascending.
   - `formatMoney` gives these results: 0.01→`$0.01`, 0.1→`$0.10`, 0.25→`$0.25`, 1→`$1`, 2.5→`$2.50`, 100→`$100`, 1000000→`$1,000,000`.
   - Each built-in preset equals its exact 26 values listed above, and Family $100 is the default on a fresh load, with empty localStorage.
2. **There is no scrolling in any game state** at **390×844, 1024×768, 1366×768, and 1920×1080**. The game states are title, pick case, opening rounds (including the reveal overlay), banker call, offer, final swap, and final reveal/result. In each, `document.documentElement.scrollHeight <= document.documentElement.clientHeight` and `scrollWidth <= clientWidth`, and no content is clipped. The Setup screen should also fit. If 26 inputs truly can't fit on the iPhone, the Setup screen *alone* may scroll internally, inside its own panel, never the page. In the PR, state how you checked each viewport (DevTools device mode is fine).
3. All 26 cases are tappable at every viewport (target ≥ 44×44 CSS px on iPhone; case grid reflows, e.g. 7/6/7/6 rows on wide screens, more rows on portrait).
4. The full game can be played to completion in each path (deal at round 1, deal mid-game, no deal + keep, no deal + swap) without errors in the console.
5. Refresh mid-round, mid-offer, and at the final swap restores the same state.
6. Setup:
   - you can edit the title and amounts;
   - invalid input is blocked with visible messages;
   - presets save, load, and delete;
   - reset restores Family $100;
   - the edited title shows on the title screen and in-game.
7. No network requests besides the page's own files (check DevTools Network). Works offline after load.
8. `prefers-reduced-motion: reduce` disables flips/confetti.
9. CI (`.github/workflows/ci.yml`, an exact copy of `ci/ci.yml`, added in this PR if it isn't on `main` yet) is green on the PR. If you couldn't add the workflow, say so and paste your local `node --test` output in the PR.

## Do not touch
- `AGENTS.md`, anything in `docs/`, `ci/ci.yml`, and `.github/workflows/ci.yml`, except as allowed in AGENTS.md: adding the workflow as a copy of `ci/ci.yml`, or changing only how tests are invoked.
- `README.md`, except to add a short "How to play / How to edit amounts" section.
- No other repositories. In particular, the Jeopardy repos are reference only.
