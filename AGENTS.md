# AGENTS.md

## What this fork is

`shockstruck/OpenGameInstaller` is ShockStruck's maintained fork of
[`Nat3z/OpenGameInstaller`](https://github.com/Nat3z/OpenGameInstaller), kept so a ShockStruck
workstation package can build against a pinned, known-good revision instead of tracking upstream's
moving `main`. The upstream remote is named `upstream`
(`git remote add upstream https://github.com/Nat3z/OpenGameInstaller.git`); nobody pushes to
`upstream` and nobody opens a pull request on `Nat3z/OpenGameInstaller` from here. Merging upstream
changes into this fork is Lead-run, not something any contributor does ad hoc.

## Licence

This project is AGPL-3.0-only. Keep every upstream file's licence header and the root `LICENSE`
file intact. No proprietary code, no relicensing, no stripping of attribution.

## Toolchain

- `bun@1.3.14` (the version CI pins — install with `npm install -g bun@1.3.14` if Bun is not
  already present).
- `bun install --frozen-lockfile` at the repo root.
- `bun run lint` (Biome).
- `bun run typecheck`.
- `bun test` in the workspace you changed (`application/`, `updater/`).

Do not run `electron-pack` / `electron-builder` locally as a validation step — that is CI's job.

## What CI runs

- `Typecheck` — runs on every pull request and on push to `main`.
- `Build/release` — runs on every push; builds the Linux AppImage and the Windows portable/setup
  assets, and cuts a GitHub Release on `v*` tags.
- `Publish npm packages` — publishes the `packages/*` workspaces to npm; guarded to run only in
  `Nat3z/OpenGameInstaller` and inert on this fork.

Collect a pull request's checks once, as one foreground `gh pr checks <n> --watch`. Never poll or
watch a check more than once per push; never use `gh run watch`.

## Branch, commit and PR shape

- Branch names: `feat/`, `fix/`, `ci/`, or `docs/` followed by a short slug.
- Commit subjects: `type(scope): subject`.
- The PR body carries the raw output of every verification command run, the success condition, and
  the rollback.
- No tracker/issue identifiers in any committed file — task context belongs in the PR body, not in
  the config or source tree.

## Never, on this fork

- `git push --force` or `--force-with-lease`.
- `git commit --no-verify` or any other hook bypass.
- Hand-editing `bun.lock` without an accompanying dependency change.
- Committing a secret, token, password, or key of any kind — this source deliberately holds none.
- Adding a `uses:` in any workflow that is not pinned to a 40-hex commit digest.
- Rewriting an upstream file for style alone; changes should stay additive and guarded so
  `git merge upstream/main` remains clean.
