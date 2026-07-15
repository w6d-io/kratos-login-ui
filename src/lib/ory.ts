// Flow URLs are relative paths, so they work on any deployment domain without
// needing the runtime origin. (getOryConfig/oryConfig were dead code feeding the
// unused @ory/elements-react OryProvider — removed; they broke `next build`'s
// type-check against elements-react's ProjectConfiguration.)

/** Build flow initiation URL — uses relative path so it works on any domain */
export function initFlowUrl(
  flowType: string,
  returnTo?: string,
  opts?: { refresh?: boolean; aal?: "aal1" | "aal2" },
): string {
  const base = `/self-service/${flowType}/browser`;
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
