# Project context

## What this is
A digital **Deal or No Deal** game for Markus family parties. It is a single static web page hosted on GitHub Pages:
https://hmarkus32.github.io/deal-or-no-deal/

## How it gets played
- The **host** (Hunter) opens the page in **Chrome on a laptop** and casts the tab to a TV (a TCL Google TV, using Chromecast tab casting). Chrome is usually in full screen.
- The host drives everything: clicking cases, pressing DEAL or NO DEAL, and so on. The room watches the TV and shouts advice. The host may also run it straight from an iPhone or iPad.
- Because of this, every control must be **big, obvious, and tap-friendly** (minimum touch target is about 44×44 CSS px), and every bit of on-screen text must be **readable from across a living room**.
- Mouse and touch are the main inputs. Keyboard shortcuts are a nice extra, not required.

## House style (it must match Hunter's existing Jeopardy boards)
Reference: repo `hmarkus32/markus-family-thanksgiving-jeopardy`, live at https://hmarkus32.github.io/markus-family-thanksgiving-jeopardy/. Look at it, but **do not modify it**. Its conventions:

1. **Single self-contained static page.** It is one `index.html` with inline CSS and JS, and no build step. (Here you may split the game logic into a separate plain `.js` file so Node can test it. See the brief.)
2. **No scrolling, ever, in game screens.** The page is `html,body{height:100%;overflow:hidden}`, and layouts use flex/grid sized with `vw`, `vh`, `vmin`, and `clamp()`. In every game state, `document.documentElement.scrollHeight <= clientHeight` and nothing is clipped or cut off.
3. **The four target viewports must all work**, with no scrolling and no overlap:
   - iPhone: **390×844** (portrait)
   - iPad: **1024×768**
   - Laptop: **1366×768**
   - TV: **1920×1080**
4. **Big readable text.** Main text uses roughly `font-size: clamp(28px, min(3.1vw, 4.5vh), 40px)`. Headings and amounts are larger, using a pattern like `clamp(22px, 4vw, 78px)`. Small labels never go under about 12px on a phone or about 18px on a TV.
5. **Fonts.** The Jeopardy boards load Google Fonts. This project must **not** use external fonts. Use system font stacks, for example `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`, and heavy weights (800–900) for that game-show punch.
6. **State in localStorage under a versioned key**, for example `dond-state-v1`. A refresh mid-game resumes exactly where you left off. If the saved state shape changes, bump the version.
7. **Bold, festive, high-contrast look.** It uses a radial-gradient stage background, gold accents, pill-shaped buttons, soft shadows, and subtle decorative animation.
8. **Host-safety.** Destructive actions like New Game or resetting presets need a confirm step, so a mis-tap at a party doesn't wipe the game.

## Out of scope
Multiplayer, networking, accounts, a server, sound files from the internet, and analytics.
