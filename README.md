<div align="center">

# kratos-login-ui

**Brand-agnostic, runtime-configurable self-service UI for [Ory Kratos](https://www.ory.sh/kratos/).**

One Docker image. Every URL, brand asset, theme color, label, and copy string is read at request time from environment variables. No rebuild per environment. No rebuild per tenant. No build-time branding baked in anywhere.

[![CI](https://github.com/w6d-io/kratos-login-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/w6d-io/kratos-login-ui/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/w6d-io/kratos-login-ui?display_name=tag&sort=semver)](https://github.com/w6d-io/kratos-login-ui/releases)
[![Image](https://img.shields.io/badge/ghcr.io-kratos--login--ui-blue?logo=github)](https://github.com/w6d-io/kratos-login-ui/pkgs/container/kratos-login-ui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![Kratos](https://img.shields.io/badge/Ory%20Kratos-1.x-purple)](https://www.ory.sh/kratos/)

</div>

---

## Table of Contents

- [What it is](#what-it-is)
- [Features](#features)
- [60-second demo](#60-second-demo)
- [Image tags](#image-tags)
- [Configuration](#configuration)
- [Auth stack integration](#auth-stack-integration)
- [Deployment](#deployment)
- [Branding](#branding)
- [Local development](#local-development)
- [How runtime config works](#how-runtime-config-works)
- [FAQ / Troubleshooting](#faq--troubleshooting)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## What it is

A drop-in replacement for Ory Kratos' default self-service UI pages — login, registration, recovery, email verification, account settings, error page, logout. Built with Next.js 14 App Router and `@ory/elements-react`. Designed to be shipped once and deployed everywhere, with every customizable knob exposed as an environment variable.

There is **zero tenant-specific code** in this image. Theme, copy, logo, allowed return URLs, Kratos endpoints, and footer content are all read from the environment on every request through [`next-runtime-env`](https://github.com/expatfile/next-runtime-env). Run the same digest in dev, staging, prod, and across N tenants by varying environment alone.

## Features

- **Login** with email/password and OIDC providers (configured in Kratos).
- **AAL2 step-up** — automatically forces `aal=aal2` when a session at `aal1` lands on `/login`, surfacing the TOTP / WebAuthn / lookup-secret challenge instead of looping.
- **Refresh mode** — `/login?refresh=true` switches the form to a "confirm password" state (email read-only, no OIDC, no registration link); used for privileged-session re-auth.
- **`browser_location_change_required` handled** — 422 responses from Kratos with `redirect_browser_to` are followed client-side, fixing aal1↔aal2 redirect loops.
- **Account settings** with active tab persisted via `sessionStorage` so the tab survives the redirect chain triggered after a privileged-session refresh; restored once, then cleared so tabs don't get sticky across logins.
- **Registration** with email verification.
- **Recovery** via email code or magic link.
- **Dark / light mode** with system-preference detection and instant theme toggle (no flash).
- **Built-in provider icons** for Google, Microsoft / Azure, GitHub, GitLab, Apple, Facebook; generic SSO badge for SAML / OIDC / unknown providers.
- **Fully responsive**.
- **No telemetry**. No phone-home. No external script tags beyond fonts.
- **MIT licensed**.

## 60-second demo

```bash
git clone https://github.com/w6d-io/kratos-login-ui.git
cd kratos-login-ui
docker compose up --build
```

Then open <http://localhost:3000/login>. The stack ships Kratos pre-wired with a sample identity schema (email + name) — sign up, log in, change your password.

Run the image standalone against your own Kratos:

```bash
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_APP_NAME="My App" \
  -e NEXT_PUBLIC_KRATOS_BROWSER_URL="https://auth.example.com" \
  -e KRATOS_PUBLIC_URL="https://auth.example.com" \
  -e NEXT_PUBLIC_DEFAULT_RETURN_URL="https://app.example.com" \
  -e NEXT_PUBLIC_ALLOWED_RETURN_URLS="https://*.example.com" \
  ghcr.io/w6d-io/kratos-login-ui:latest
```

## Image tags

Published to **`ghcr.io/w6d-io/kratos-login-ui`**, multi-arch (`linux/amd64` + `linux/arm64`).

| Tag | When pushed | Use case |
|-----|-------------|----------|
| `vX.Y.Z` | Released from `main` via the `Build & Release` workflow | Production — pin a specific version |
| `latest` | Each release pushes `latest` alongside `vX.Y.Z` | Non-prod environments only |

> Production deployments should pin a `vX.Y.Z` tag, never `latest`.

## Configuration

All variables marked `NEXT_PUBLIC_*` are injected into the browser at request time via [`<PublicEnvScript />`](https://github.com/expatfile/next-runtime-env). Non-prefixed variables are server-side only.

See [`.env.example`](./.env.example) for a copy-pasteable template.

### Kratos

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `NEXT_PUBLIC_KRATOS_BROWSER_URL` | ✅ | _(none)_ | Browser-facing Kratos public URL. Used for redirects initiated from the client. Example: `https://auth.example.com` |
| `KRATOS_PUBLIC_URL` | ✅ | _(falls back to `NEXT_PUBLIC_KRATOS_BROWSER_URL`)_ | In-cluster Kratos public URL for server-side calls. Server-only (no `NEXT_PUBLIC_` prefix). Example: `http://kratos-public.kratos.svc.cluster.local:80` |

### Redirects

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `NEXT_PUBLIC_DEFAULT_RETURN_URL` | recommended | `/` | Destination after a successful flow when no `return_to` is supplied. |
| `NEXT_PUBLIC_ALLOWED_RETURN_URLS` | recommended | `*` (allow-all) | Comma-separated allow-list of origins for `return_to`. Supports `*` wildcards. Example: `https://*.example.com,https://app.example.com` |

> **Security note**: `*` is fine for dev but lets any site send a user through your auth UI back to itself. Always set a specific allow-list in production.

### Branding

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `Auth` | Displayed in the header, page titles, and the Ory project name. |
| `NEXT_PUBLIC_LOGO_URL` | `/logo.svg` | Logo URL — **local path** served from `/public` (e.g. `/logo.svg`, `/brand/my-logo.svg`) **or remote URL** (e.g. `https://cdn.example.com/logo.svg`). |
| `NEXT_PUBLIC_FAVICON_URL` | `/favicon.ico` | Favicon URL — same rules as logo. |

### Theme

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_THEME_PRIMARY_COLOR` | `3B82F6` | Primary accent color. Hex **without `#`**. |
| `NEXT_PUBLIC_THEME_DARK_MODE` | `true` | `true` to default to dark mode; `false` to default to light. User can still toggle. |
| `NEXT_PUBLIC_THEME_BACKGROUND_COLOR` | `111827` | Dark-mode background. Hex **without `#`**. |

### Copy

All optional. Defaults below.

| Variable | Default |
|---|---|
| `NEXT_PUBLIC_LOGIN_TITLE` | `Welcome back` |
| `NEXT_PUBLIC_LOGIN_SUBTITLE` | `Sign in to your account` |
| `NEXT_PUBLIC_REGISTER_TITLE` | `Create account` |
| `NEXT_PUBLIC_REGISTER_SUBTITLE` | `Get started with your account` |
| `NEXT_PUBLIC_RECOVERY_TITLE` | `Reset password` |
| `NEXT_PUBLIC_RECOVERY_SUBTITLE` | `Enter your email to reset your password` |
| `NEXT_PUBLIC_VERIFICATION_TITLE` | `Verify your email` |
| `NEXT_PUBLIC_VERIFICATION_SUBTITLE` | `Enter the code sent to your email` |
| `NEXT_PUBLIC_VERIFICATION_SUCCESS_TITLE` | `Email verified` |
| `NEXT_PUBLIC_VERIFICATION_SUCCESS_SUBTITLE` | `Your email has been verified` |

### Footer (optional)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_FOOTER_TEXT` | `""` | Plain text shown in the footer. |
| `NEXT_PUBLIC_FOOTER_LINKS` | `[]` | JSON array of `{label, url}`. Example: `[{"label":"Privacy","url":"/privacy"}]` |

## Auth stack integration

This UI is one component in a typical Ory-based stack:

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Browser   │ ── │  Reverse     │ ── │ kratos-login-ui  │
└─────────────┘    │  proxy /     │    │   (this image)   │
                   │  Oathkeeper  │    └──────────────────┘
                   └──────────────┘             │
                          │             self-service calls
                          ▼                     ▼
                  ┌───────────────┐    ┌──────────────┐
                  │ AuthZ engine  │    │ Ory Kratos   │
                  │ (OPA, etc.)   │    │   (public)   │
                  └───────────────┘    └──────────────┘
```

### Kratos configuration

In your `kratos.yml`, point each self-service flow `ui_url` at this UI:

```yaml
selfservice:
  default_browser_return_url: https://app.example.com/
  allowed_return_urls:
    - https://app.example.com

  flows:
    login:
      ui_url: https://auth.example.com/login          # this UI
    registration:
      ui_url: https://auth.example.com/register       # this UI
    recovery:
      ui_url: https://auth.example.com/recovery       # this UI
    verification:
      ui_url: https://auth.example.com/verification   # this UI
    settings:
      ui_url: https://auth.example.com/settings       # this UI
    error:
      ui_url: https://auth.example.com/error          # this UI
```

A complete working `kratos.yml` lives in [`examples/kratos/kratos.yml`](./examples/kratos/kratos.yml) (used by `docker compose up`).

### Reverse proxy / Oathkeeper

The UI must be served on the **same origin** as Kratos' browser endpoints, or Kratos cookies won't be sent on flow-fetch requests. Typical setup:

- `https://auth.example.com/` → routed to this image
- `https://auth.example.com/self-service/*` → routed to Kratos public
- `https://auth.example.com/sessions/whoami` → routed to Kratos public

If you use Ory Oathkeeper as the gateway, allow anonymous access to this UI's routes (`/login`, `/register`, `/recovery`, `/verification`, `/error`, `/logout`, `/_next/*`, `/logo.svg`, `/favicon.ico`).

### OIDC providers

Configure Google, GitHub, GitLab, Microsoft, Apple, Facebook, SAML etc. **in Kratos**, not here. The UI auto-renders provider buttons from Kratos' flow response and matches the provider ID against built-in icons:

| Kratos provider id | Recognized as |
|---|---|
| `google`, `google-*` | Google |
| `microsoft`, `microsoft-*`, `azure`, `azure-*` | Microsoft |
| `github`, `github-*` | GitHub |
| `gitlab`, `gitlab-*` | GitLab |
| `apple`, `apple-*` | Apple |
| `facebook`, `facebook-*` | Facebook |
| `saml*`, `sso*`, `oidc*` | Generic SSO badge |
| _anything else_ | Generic question-mark badge |

So `gitlab-acme` and `gitlab-self-hosted` both render with the GitLab icon. You don't need to fork the image to add a new provider id — only to add a custom icon.

## Deployment

### Helm chart (`w6d-io/charts`)

The companion Helm chart at <https://github.com/w6d-io/charts> (`charts/auth/`) ships this image already wired. Minimal values:

```yaml
kratosLoginUi:
  enabled: true
  image:
    repository: ghcr.io/w6d-io/kratos-login-ui
    tag: "0.1.0"             # pin a published vX.Y.Z (drop the leading `v`)
  branding:
    appName: "My App"
    logoUrl: "/logo.svg"
  theme:
    primaryColor: "3B82F6"
    darkMode: true
  kratos:
    browserUrl: "https://auth.example.com"
    # publicUrl auto-falls-back to http://<release>-kratos-public:80 if empty
    publicUrl: ""
  redirects:
    defaultReturnUrl: "https://app.example.com"
    allowedReturnUrls: "https://*.example.com"
```

The chart's release pipeline auto-bumps `kratosLoginUi.image.tag` whenever this repo cuts a new release (gated on a `CHARTS_TOKEN` secret + `CHARTS_REPO` repo variable).

### Plain Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kratos-login-ui
spec:
  replicas: 2
  selector:
    matchLabels: { app: kratos-login-ui }
  template:
    metadata:
      labels: { app: kratos-login-ui }
    spec:
      containers:
        - name: kratos-login-ui
          image: ghcr.io/w6d-io/kratos-login-ui:v0.1.0
          ports:
            - name: http
              containerPort: 3000
          env:
            - { name: NEXT_PUBLIC_APP_NAME,             value: "My App" }
            - { name: NEXT_PUBLIC_KRATOS_BROWSER_URL,   value: "https://auth.example.com" }
            - { name: KRATOS_PUBLIC_URL,                value: "http://kratos-public.kratos:80" }
            - { name: NEXT_PUBLIC_DEFAULT_RETURN_URL,   value: "https://app.example.com" }
            - { name: NEXT_PUBLIC_ALLOWED_RETURN_URLS,  value: "https://*.example.com" }
            - { name: NEXT_PUBLIC_THEME_PRIMARY_COLOR,  value: "3B82F6" }
          readinessProbe:
            httpGet: { path: /, port: http }
            initialDelaySeconds: 5
          livenessProbe:
            httpGet: { path: /, port: http }
            initialDelaySeconds: 10
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 200m, memory: 256Mi }
---
apiVersion: v1
kind: Service
metadata: { name: kratos-login-ui }
spec:
  selector: { app: kratos-login-ui }
  ports:
    - { name: http, port: 80, targetPort: http }
```

### Multiple brands / tenants from one image

Deploy the same image N times with different env. No per-brand build:

```yaml
# brand-a
NEXT_PUBLIC_APP_NAME:            "Brand A"
NEXT_PUBLIC_LOGO_URL:            "https://cdn.brand-a.com/logo.svg"
NEXT_PUBLIC_THEME_PRIMARY_COLOR: "FF6B35"
NEXT_PUBLIC_KRATOS_BROWSER_URL:  "https://auth.brand-a.com"
NEXT_PUBLIC_DEFAULT_RETURN_URL:  "https://app.brand-a.com"

# brand-b
NEXT_PUBLIC_APP_NAME:            "Brand B"
NEXT_PUBLIC_LOGO_URL:            "/brand/brand-b.svg"
NEXT_PUBLIC_THEME_PRIMARY_COLOR: "3B82F6"
NEXT_PUBLIC_KRATOS_BROWSER_URL:  "https://auth.brand-b.com"
NEXT_PUBLIC_DEFAULT_RETURN_URL:  "https://app.brand-b.com"
```

## Branding

The image ships with **no branding by default** — `NEXT_PUBLIC_APP_NAME` falls back to `Auth`, and `NEXT_PUBLIC_LOGO_URL` falls back to a generic lock-icon `/logo.svg`.

Three ways to supply your own logo:

| Strategy | How | When to use |
|---|---|---|
| **Bake into a derivative image** | `FROM ghcr.io/w6d-io/kratos-login-ui:vX.Y.Z`, then `COPY my-logo.svg /app/public/brand/my-logo.svg`, then set `NEXT_PUBLIC_LOGO_URL=/brand/my-logo.svg` | You control the image, want offline-self-contained deploys |
| **Remote URL** | `NEXT_PUBLIC_LOGO_URL=https://cdn.example.com/logo.svg` | You host assets on a CDN |
| **ConfigMap mount** | Mount a `ConfigMap` with your SVG at `/app/public/brand/logo.svg`, set `NEXT_PUBLIC_LOGO_URL=/brand/logo.svg` | Kubernetes; swap branding without rebuilding |

Same three options apply to `NEXT_PUBLIC_FAVICON_URL`.

## Local development

```bash
git clone https://github.com/w6d-io/kratos-login-ui.git
cd kratos-login-ui
npm ci
cp .env.example .env.local
# edit .env.local — point KRATOS_PUBLIC_URL at a reachable Kratos
npm run dev
```

Open <http://localhost:3000/login>.

Need a Kratos instance? `docker compose up kratos` starts one on `:4433` using [`examples/kratos/kratos.yml`](./examples/kratos/kratos.yml).

### Scripts

```bash
npm run dev          # Next dev server on :3000
npm run build        # Production build (standalone output)
npm start            # Start production server (after build)
npm run lint         # Next lint
npm run test         # Vitest (passes with no tests)
npm run test:coverage
```

## How runtime config works

Next.js inlines `process.env.NEXT_PUBLIC_*` into the JS bundle **at build time**. That's the wrong model when you want one image per fleet.

This project uses [`next-runtime-env`](https://github.com/expatfile/next-runtime-env):

1. `<PublicEnvScript />` is rendered in [`src/app/layout.tsx`](./src/app/layout.tsx). On every request it injects a tiny `<script>` containing the current values of all `NEXT_PUBLIC_*` env vars present in the container's environment.
2. Application code reads them through the `env()` function (server- and client-safe).
3. [`src/lib/config.ts`](./src/lib/config.ts) wraps that as a Proxy so consumers do `config.appName`, `config.theme.primaryColor`, etc. — every access is fresh.

Result: change a value, restart the pod (or just reload — `env()` re-reads on each request), and the UI reflects the new value. No `docker build` involved.

## FAQ / Troubleshooting

<details>
<summary><b>Login loops between <code>/login</code> and <code>/login?aal=aal2</code></b></summary>

You have a session at `aal1` and an `aal2` requirement. The UI handles this automatically — if you still see a loop, check that Kratos returns `redirect_browser_to` with `aal=aal2` and that your reverse proxy doesn't strip the query string.
</details>

<details>
<summary><b>"Invalid <code>return_to</code>" error</b></summary>

The destination is not in `NEXT_PUBLIC_ALLOWED_RETURN_URLS`. Update the allow-list. Wildcards are supported (`https://*.example.com`).
</details>

<details>
<summary><b>Logo / favicon not showing</b></summary>

- Local path: confirm the file exists in `/public` inside the image (`docker run --rm <image> ls public/`).
- Remote URL: confirm it's reachable from the browser (open it directly in a new tab).
- Mixed content: a remote `http://` logo on an `https://` page will be blocked by the browser. Use `https://`.
</details>

<details>
<summary><b>Settings page tab keeps reverting</b></summary>

After a privileged-session refresh, Kratos sends the browser through a redirect chain. The active tab is persisted in `sessionStorage` (key `settingsActiveTab`) and restored once. If you see stickiness, clear `sessionStorage` — the restore is one-shot by design.
</details>

<details>
<summary><b>Env values come back empty client-side</b></summary>

`next-runtime-env` requires `<PublicEnvScript />` in the `<head>`. It lives in [`src/app/layout.tsx`](./src/app/layout.tsx). Don't remove it. If you set new `NEXT_PUBLIC_*` values, restart the container — the script captures `process.env` on each request, but the container's environment is read at process start.
</details>

<details>
<summary><b>OIDC provider button has no icon</b></summary>

The provider id from Kratos doesn't match any prefix in the [provider-icon mapping](./src/components/ui/ProviderLogo.tsx). The button still works — you'll see a generic SSO badge. Open a PR to add an icon if you want pixel-perfect branding for your provider.
</details>

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch model, label conventions, commit-message format, and release process.

TL;DR:

- Branch off `develop`, target `develop` in your PR.
- Apply one **type** label (`feature` / `bug` / `chore` / `refactors` / `docs` / `perf` / `tests` / `maintenance`).
- Releases are PRs from `develop` to `main` with `release` + one of `major` / `minor` / `patch`.
- `npm run lint && npm test && npm run build` clean before pushing.

## Security

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for the private reporting process.

## License

[MIT](./LICENSE) — free to use, modify, redistribute. No warranty.
