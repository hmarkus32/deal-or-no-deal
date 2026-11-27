# AGENTS.md — standing rules for coding agents (ChatGPT Codex)

This repo is a family party game (digital **Deal or No Deal**) for Hunter Markus.
A manager bot reviews every PR, and Hunter approves before anything ships.
Merging to `main` deploys the site with GitHub Pages, so **main is production**.

## Workflow
1. Read this file, then `docs/CONTEXT.md`, then the current brief in `docs/briefs/` (the one you were asked to implement).
2. Work **only** on a branch named `codex/<topic>` (for example `codex/deal-or-no-deal-v1`).
3. Open a pull request into `main` when done.
4. **Never push to `main`. Never merge a PR**, not even your own and not even when CI is green. The reviewer merges.
5. Keep commits focused, with clear messages.

## Hard rules
- **No secrets.** No API keys, tokens, passwords, or personal data in code, commits, or PRs.
- **No network services except the PeerJS public broker and WebRTC** (PeerJS's default STUN/TURN servers) for the optional linked host mode described in `docs/briefs/02-host-phone.md`. No secrets, accounts, analytics, trackers, CDNs, web fonts, or other third-party calls. PeerJS is vendored in `vendor/`; never load it from a CDN. **Single-device mode must work fully offline** once the page has loaded and must make no network requests.
- **No build step and no npm runtime dependencies.** Use plain HTML, CSS, and JavaScript only. A single `index.html` is fine. Keep assets inline or committed in the repo. Do not add a bundler, a framework, TypeScript compilation, or `node_modules`.
- **Tests must pass** with plain `node --test`, with no package installs. Add or extend tests for all game logic you write.
- Do not modify `AGENTS.md`, anything under `docs/`, `vendor/` (vendored third-party files), `ci/ci.yml`, or `.github/workflows/ci.yml`. The one exception is CI: you may change how tests are invoked in `ci.yml` if strictly necessary. Explain any such change in the PR.
- **CI workflow:** the canonical workflow is `ci/ci.yml`. If `.github/workflows/ci.yml` does not exist yet on `main`, add it in your PR as an **exact copy** of `ci/ci.yml`. This is allowed and expected. If your push of that file is rejected for permissions, drop it from the PR and say so in the PR description.
- Follow `docs/CONTEXT.md` (look, feel, and layout rules) and the brief. If the brief and CONTEXT conflict, the brief wins. If something is ambiguous, pick the simplest reasonable option and note it in the PR.

## PR description must include
1. **What you did**: a summary of the features and files changed.
2. **How each acceptance criterion was checked**: go through the brief's checklist item by item and say how you verified each one (test name, manual check, viewport measured).
3. **Anything not done**, partially done, or deviating from the brief, and why.
4. How to run the tests (`node --test`).
