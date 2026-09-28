# Self-service flows

How kratos-login-ui moves a browser through Kratos (v1.3) flows, and where every
redirect comes from. The error and redirect handling lives in `src/lib/flow-nav.ts`,
which the pages apply through `src/lib/flow-nav-browser.ts`.

## Ground rules

- **Kratos lands the browser on `/<page>?flow=<id>` and nothing else.** `return_to`,
  `requested_aal` and `refresh` live on the flow object. Pages read them with
  `flowContext(flow)`, never from our own URL. The context is also kept in
  sessionStorage per flow id, so a 410 on load, which has no body, can still
  restart the same kind of flow.
- **return_to is validated everywhere we navigate ourselves** (`safeReturnTo`). Allowed:
  same-origin paths or URLs, and origins matched by `NEXT_PUBLIC_ALLOWED_RETURN_URLS`.
  Each pattern is an origin whose regex metacharacters are escaped. `*` matches exactly
  one DNS label, so `https://*.example.com` accepts `app.example.com` but not
  `a.b.example.com`, `x.example.com.evil.io` or `x.example.com@evil.io`. This is
  stricter than Kratos' own suffix match. Only http(s) without userinfo is accepted. Redirects that Kratos hands us (`redirect_browser_to`,
  `continue_with`) must also point at this UI, Kratos' public URL, or an allowed
  origin (`safeKratosRedirect`).
- **The landing page after sign-in** (`landingUrl`) is a valid return_to, else
  `/welcome`. It is never Kratos' `default_browser_return_url`, never a static default,
  and never this UI's `/` or `/login` (loop). On success without a valid return_to, a
  `continue_with` redirect to anything other than a flow hop is replaced by `/welcome`.
  Flow hops are this UI's own pages and Kratos' `/self-service/*`.
- **Automatic restarts** (expired flow, CSRF, unknown flow) are capped at 3 per flow
  kind per minute (`restartGuard`). After that the page shows an error instead of
  looping.

## Errors: one table (`resolveKratosError`)

| Kratos answer | Action |
|---|---|
| 422 `browser_location_change_required` | go to `redirect_browser_to` (e.g. Kratos' aal2 flow after the first factor when whoami requires `highest_available`) |
| 403 `session_aal2_required` | go to `redirect_browser_to`, adding `return_to` when Kratos left it out (settings: this page) |
| 403 `session_refresh_required` | go to `redirect_browser_to` (a `refresh=true` login that returns to the settings flow) |
| 401 `session_inactive` / `session_aal1_required` / any 401 | sign in with `return_to` = this page (settings) or the flow's return_to |
| 410 `self_service_flow_expired` | go to Kratos' replacement flow (`use_flow_id`). For a step-up or refresh login, restart with the flow context instead: v1.3's replacement drops `requested_aal`/`refresh` |
| 403 `security_csrf_violation`, `security_identity_mismatch` | restart with the flow context |
| 404 unknown flow | restart (login, registration, settings); recovery/verification say "not available" |
| 400 `session_already_available` | go to `landingUrl(return_to)` |
| 400/422 with a flow body whose `expires_at` has passed | restart with the flow context. Kratos v1.3 answers a submit on an expired aal2 flow this way, with "A valid session was detected", instead of 410 |
| 400/422 with a flow body | render that flow (field and flow messages) |
| anything else | inline error, page stays usable |

`continue_with` on success (`resolveContinueWith`) handles these actions:
`redirect_browser_to`, `show_verification_ui`, `show_recovery_ui` and `show_settings_ui`
(which keeps the tab hash). A session with no directive lands on `landingUrl`. In
settings, a redirect back to the same settings flow just re-renders. Settings ignores
`show_verification_ui` except on profile saves: Kratos prepends it to every save while
an address is unverified.

## Login

```
/login (no flow)
  └─ whoami
       ├─ 401 ──────────────► init login(return_to[, refresh])            (aal param dropped: aal2 without a session 401s)
       ├─ 403 aal2_required ► init login(return_to, aal=aal2)
       └─ 200
            ├─ refresh/aal asked ► init login(return_to, refresh, aal)
            ├─ aal1 and identity has a 2nd factor ► aal2 flow in place (step-up)
            └─ else ► landingUrl(return_to)
/login?flow=id  → render step from the flow's groups:
   password (+ oidc, passkey, "code instead") | code (email) | totp | webauthn | lookup_secret
   submit ─┬─ 200 session aal1, flow not aal2/refresh, identity has a 2nd factor ► aal2 flow in place
           ├─ 200 continue_with ► follow (return_to)
           └─ error ► table above
   aal2 flow with no 2nd factor for this identity ► landingUrl(return_to)   (no empty card)
   "Back to sign-in" on an aal2 step ► /logout?return_to=/login?return_to=<flow return_to>
   refresh flow ► compact "confirm your password" card (identifier taken from the session; Kratos v1.3 leaves it empty)
```

The step-up after the first factor is on by default. `NEXT_PUBLIC_STEP_UP_AFTER_LOGIN=false`
turns it off. It exists because the chart runs `session.whoami.required_aal: aal1`, and
under that setting Kratos never asks an enrolled user for the second factor at sign-in.
This is only the UI prompt: the gateway (`/access`) and Kratos settings
(`required_aal: highest_available`) still enforce aal2 themselves.

OIDC and passkey submit as native form POSTs, and Kratos redirects the browser itself.
The first page load of the next hop still applies the whoami rules.

## Settings

```
/settings (no flow) ─ whoami 401 ► init login(return_to=/settings?…)   (Kratos would return to OUR return_to, skipping settings)
                    └ else ► init settings(return_to) — Kratos 303s to login?aal=aal2 when the identity has 2FA
/settings?flow=id ─ GET 403 aal2_required (e.g. after a recovery link) ► Kratos step-up URL, back to this flow
                  ─ GET 401 ► sign in, back here
save (profile | password | totp | passkey | lookup_secret)
   ├─ 200 ► continue_with (return_to, e.g. back to the site after 2FA enrolment) or re-render
   ├─ 403 session_refresh_required ► refresh login ► Kratos /self-service/settings?flow=id ► /settings?flow=id (tab restored from sessionStorage)
   └─ other errors ► table above
```

## Registration and verification

`/register` → Kratos → `/register?flow=id` → submit. On success Kratos answers
`continue_with` (`show_verification_ui` and/or `redirect_browser_to`), or 422
`browser_location_change_required`. `/verification?flow=id` handles code entry.
`passed_challenge` shows the success card, and `continue_with` returns to the flow's
return_to.

## Recovery (link, as deployed; code also supported)

```
/recovery → Kratos → /recovery?flow=id → email → state sent_email ("check your inbox"; same message whether or not the address exists)
link click → Kratos /self-service/recovery?token → privileged aal1 session → /settings?flow=id
   └─ identity has 2FA: GET 403 session_aal2_required ► aal2 login ► back to that settings flow
```

After recovery Kratos requires aal2 for settings (`required_aal: highest_available`).
Someone who lost their authenticator must use a backup code or ask an administrator.

## /welcome ("Where to?")

This is where a finished flow goes without a valid return_to: login, step-up,
registration, verification, the error page, and a signed-in visit to `/login`. Logic is in
`src/lib/landing.ts`; the page is `src/app/welcome`.

0. The page this tab's sign-in started for comes first. `/login` and `/register` remember
   a valid return_to (URL or flow) in sessionStorage for 30 minutes, so a hop that starts
   a fresh flow without it still lands there, not on the picker. It is cleared once the
   gate continues to a destination, when /welcome uses it, and on sign-out. Every link
   back to sign-in (email-code step, recovery, "Forgot password?") carries return_to as
   well.
1. The site the flow started from is tried next. That is the flow page's referrer when
   it is an allowed URL on another host (kept in sessionStorage), then this UI's own
   host. The page calls `GET /api/landing?host=`, which returns jinbe by-host
   `defaultReturnUrl` after an allow-list check. If there is a URL, go there.
2. Otherwise the page calls `GET /api/sites/mine`, which proxies jinbe
   `/api/public/sites/mine` and forwards only the `ory_kratos_session*` cookies. Every
   site URL is allow-list checked, and bad entries are dropped.
   - exactly one site → go there
   - several → picker, with the last choice first (localStorage, in try/catch)
   - none → "No sites yet"
   - 401 → sign in, then back to /welcome
   - jinbe down or 503 `policy_unavailable` → neutral "try again", plus a console link
     (`NEXT_PUBLIC_CONSOLE_URL`). It never shows an empty list.
3. Automatic redirects use the 30 s return guard. A site that bounces straight back gets
   the picker instead of a loop.

## Logout

`/logout?return_to=` creates a logout flow and follows it automatically (return_to is
validated here and again by Kratos). `?confirm=false` shows a confirm card. With no
session, the page links to sign-in.

## /access (2FA-gated sites)

`/access?site=&return_to=` asks jinbe why the gateway refused (a `reason` query
parameter is ignored):

- `unauthenticated` → `/login?return_to=`
- `ok` → back to return_to, with a 30 s loop guard
- `forbidden` / `not_found` → branded no-access page
- `needs_2fa` → one of:
  - Kratos step-up URL, when whoami answers 403 aal2
  - an aal2 flow in place, when the identity has factors
  - enrolment in settings, with a settings flow whose return_to is the site
- jinbe down → neutral retry page

The gateway re-checks on return, so nothing on this page grants access.

## What no page reveals

Login with a password gives the same message for an unknown account or a wrong password
(4000006). Recovery gives the same "email sent" message for any address (1060002).
Passwordless code login: Kratos v1.3 answers an unknown address with 4000035 ("account
does not exist or has not setup sign in with code"). The UI replaces that with a neutral
"if this address can sign in with a code, we sent one" (`flow-messages.ts`). Kratos'
JSON API still distinguishes the two cases; only turning off
`methods.code.passwordless_enabled` closes that. Registration necessarily reports
"account already exists".
