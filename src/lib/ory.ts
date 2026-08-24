// Flow URLs share createBrowserClient's base rules: explicit
// NEXT_PUBLIC_KRATOS_BROWSER_URL wins, otherwise same-origin (Oathkeeper).
// (getOryConfig/oryConfig were dead code feeding the unused
// @ory/elements-react OryProvider — removed; they broke `next build`'s
// type-check against elements-react's ProjectConfiguration.)
import { kratosBrowserBase } from "./kratos";

/** Build flow initiation URL against the browser-facing Kratos base */
export function initFlowUrl(
  flowType: string,
  returnTo?: string,
  opts?: { refresh?: boolean; aal?: "aal1" | "aal2" },
): string {
  const base = `${kratosBrowserBase()}/self-service/${flowType}/browser`;
  const params = new URLSearchParams();
  if (returnTo) params.set("return_to", returnTo);
  // refresh=true forces Kratos to bump authenticated_at even if a session
  // already exists — required for sensitive settings ops (TOTP enroll,
  // password change) past privileged_session_max_age. Without this, Kratos
  // 303s back to return_to without re-auth and the next sensitive call
  // 403s again, looping the user.
  if (opts?.refresh) params.set("refresh", "true");
  if (opts?.aal) params.set("aal", opts.aal);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
