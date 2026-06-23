# Contributing

Thanks for considering a contribution! This project follows a simple, predictable workflow.

## Branch model

Two long-lived branches. Everything else is short-lived.

| Branch | Role |
|---|---|
| `main` | Released. Every commit on `main` is a tagged release (`vX.Y.Z`). Protected, only updated via PR from `develop`. |
| `develop` | Integration. Default branch. All feature/fix work targets this branch. CI runs the full test suite on every PR. |

Tags (`v0.1.0` … `vX.Y.Z`) live on `main` and are the canonical release markers. No `release/*` branches.

## Branch naming

Short-lived branches are cut from `develop` and named with a type prefix and a short noun:

| Prefix | Use for |
|---|---|
| `feat/` | New functionality |
| `fix/` | Bug fix |
| `chore/` | Dependencies, tooling, non-functional housekeeping |
| `refactor/` | Restructure with no behaviour change |
| `docs/` | Documentation only |
| `perf/` | Performance improvement |
| `test/` | Test-only changes |

Examples: `feat/passkey-flow`, `fix/aal2-redirect-loop`, `chore/bump-next`, `refactor/config-proxy`.

**Don't** create branches named after a person (`jane/wip`), a sprint (`q2-2026`), or a vague theme (`improvements`). Don't add suffixes (`-v2`, `-new`, `-actual`) — rebase or rename instead.

## Lifecycle

1. **Branch** off the latest `develop`:
   ```bash
   git checkout develop && git pull --ff-only
   git checkout -b feat/<short-noun>
   ```
2. **Work**: commit early, push often. Don't merge `develop` into your branch — rebase instead so history stays linear.
3. **PR**: open a PR targeting `develop`. Apply at least one type label (`feature`, `bug`, `chore`, `refactors`, `docs`, `perf`, `tests`, `maintenance`). The `enforce-label` CI check blocks merge without one.
4. **Review**: address feedback in additional commits (no force-push during review unless asked). Once approved, squash-merge into `develop`.
5. **Auto-delete**: branch deletion happens automatically on merge (repo setting). Locally: `git branch -d feat/<short-noun>`.

### Releases

1. Open a PR from `develop` to `main`. Label it `release` plus one of `major` / `minor` / `patch`.
2. After merge, the `Build & Release` workflow:
   - computes the next semver from the previous tag and the PR labels,
   - builds a multi-arch image (`linux/amd64` + `linux/arm64`),
   - pushes `ghcr.io/w6d-io/kratos-login-ui:vX.Y.Z` and `:latest`,
   - creates the matching git tag on `main`,
   - publishes a GitHub release with release-drafter notes.

You can also cut a release by pushing a `vX.Y.Z` tag directly to `main` — the same workflow picks it up.

The label-to-bump mapping:
- `major` (or `breaking`) → `X+1.0.0`
- `minor` (or `feature`) → `X.Y+1.0`
- `patch` (or `fix` / `bugfix`) → `X.Y.Z+1`

## Commit messages

Conventional Commits:

```
type(scope): subject

optional body explaining the WHY, not the what.
```

Subject ≤ 72 chars, imperative mood (`add`, `fix`, `remove`, not `added` / `adds`). Body only when the reason isn't obvious from the diff. No tool-attribution trailers.

Examples:

```
feat(login): aal2 step-up + refresh-mode UI
fix(settings): restore active tab via sessionStorage after privileged refresh
refactor(config): expose runtime values via Proxy to avoid stale captures
```

## What goes into a PR

- One logical change per PR. If the PR description has to say "also", split it.
- New code carries tests where practical.
- `npm run lint && npm test && npm run build` clean locally before pushing.
- PR description states what changed, why, and any behaviour-visible deltas (new env vars, removed flags, response shape changes).

## What does NOT get a branch

- Single-commit typo fix in a comment — commit directly to `develop` if you have write access.
- Generated files (lockfiles after `npm install`) — let dependabot own those PRs.

## Local development

```bash
npm ci
cp .env.example .env.local
# edit .env.local — point at your local or shared Kratos
npm run dev
```

Open <http://localhost:3000/login>.

Need a Kratos instance? `docker compose up` ships one pre-wired — see [the README](./README.md#one-command-demo).

## Hygiene

- `git fetch --prune` regularly.
- A branch with no commits in 30 days and no open PR is stale. Either resume it (rebase on `develop`) or delete it.
- Don't keep dead branches "in case we need it later" — git tags and reflog cover that.

## Code of conduct

Be respectful. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Security

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for the reporting process.
