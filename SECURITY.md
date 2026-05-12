# Security Policy

## Supported versions

Security fixes are issued for the latest minor release on `main`. Older versions receive fixes on a best-effort basis only.

| Version | Supported |
|---|---|
| Latest `vX.Y.*` on `main` | ✅ |
| Previous minor | ⚠️ best-effort |
| Older | ❌ |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting:

1. Go to <https://github.com/w6d-io/kratos-login-ui/security/advisories/new>.
2. Fill in the form. Include:
   - Affected version(s) / commit SHA.
   - Reproduction steps.
   - Impact (information disclosure, account takeover, etc.).
   - Suggested fix if you have one.

We aim to acknowledge reports within **3 business days** and to provide a triage update within **7 business days**.

## Scope

In scope:
- Authentication / authorization flow bugs in this UI that lead to session hijacking, privilege escalation, or auth bypass.
- XSS, CSRF, open-redirect, prototype-pollution vulnerabilities in the rendered UI.
- Insecure handling of `return_to` URLs that bypass the `NEXT_PUBLIC_ALLOWED_RETURN_URLS` allow-list.
- Sensitive information disclosure via API routes, error pages, or client-side state.

Out of scope:
- Issues in Ory Kratos itself — report those upstream at <https://github.com/ory/kratos/security>.
- Misconfigured deployments (e.g. running with `NEXT_PUBLIC_ALLOWED_RETURN_URLS="*"` in production).
- Self-XSS that requires the victim to paste attacker-controlled content into their own browser console.
- Denial of service via traffic volume.

## Coordinated disclosure

We follow a 90-day coordinated disclosure timeline. We will work with reporters on a public advisory once a fix is released. Credit is given in the advisory unless the reporter prefers to remain anonymous.
