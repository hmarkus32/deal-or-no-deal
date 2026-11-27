# Deal or No Deal 💼

A digital **Deal or No Deal** party game for the Markus family. It's one static web page with no build step, cast from a laptop Chrome tab to the TV.

**Play:** https://hmarkus32.github.io/deal-or-no-deal/

## How this repo works
- `main` is production. Merging to `main` deploys with GitHub Pages.
- Code is written by ChatGPT Codex on `codex/<topic>` branches as pull requests, following `AGENTS.md`, `docs/CONTEXT.md`, and the briefs in `docs/briefs/`. PRs are reviewed and merged only after Hunter's OK.

## Tests
```
node --test
```
No installs needed. CI runs the same command on every push and PR. The workflow source is `ci/ci.yml`, installed at `.github/workflows/ci.yml`.
