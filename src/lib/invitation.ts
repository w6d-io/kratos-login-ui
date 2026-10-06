import { errorText, isInvitationToken, isRole, isUuid, joinedUrl, parseInvitation, parseInvitations, type ApiAnswer, type Invitation } from './account'

/**
 * What the invitation page shows (/invitation?token=…). Signed out → sign in or register (returning
 * here). Signed in → jinbe's GET me/invitations/by-token: the invitation (with whether my address is
 * verified yet), gone, or made for another address. A jinbe without that route (404 on the route
 * itself, no `code`) falls back: an unverified address → an accept attempt, which can't succeed
 * unverified but says whether the invitation is mine and still there; a verified one → my pending
 * invitations (shown when there is exactly one).
 */

/** What the invitation page draws. */
export type InvitationState =
  | { kind: 'bad-link' }
  | { kind: 'signed-out'; signInHref: string; registerHref: string }
  | { kind: 'unverified'; email: string; verifyHref: string; invitation?: Invitation | null }
  /** `invitation`: the invitation behind the token (or, on an older jinbe, my only pending one). */
  | { kind: 'ready'; email: string; invitation: Invitation | null; switchHref: string }
  | { kind: 'wrong-account'; email: string; switchHref: string }
  | { kind: 'gone' }
  | { kind: 'declined'; orgName: string }
  | { kind: 'unavailable' }

export interface Me {
  email: string
  verified: boolean
}

export interface InvitationDeps {
  token: string | null
  /** null when signed out. */
  me: Me | null
  byToken: (token: string) => Promise<ApiAnswer>
  accept: (token: string) => Promise<ApiAnswer>
  mine: () => Promise<ApiAnswer>
  urls: { signIn: string; register: string; verify: string; switchAccount: string }
}

export type AcceptOutcome =
  | { kind: 'joined'; to: string }
  | { kind: 'state'; state: InvitationState }
  | { kind: 'error'; message: string }
  | { kind: 'signed-out' }

/** One accept answer, as the page's next step. */
export function acceptOutcome(a: ApiAnswer, me: Me, urls: InvitationDeps['urls']): AcceptOutcome {
  const d = (a.data && typeof a.data === 'object' ? a.data : {}) as { code?: unknown; organization?: { id?: unknown }; dropped?: unknown }
  if (a.ok && isUuid(d.organization?.id)) return { kind: 'joined', to: joinedUrl(d.organization.id, Array.isArray(d.dropped) ? d.dropped.filter(isRole) : []) }
  if (a.status === 401) return { kind: 'signed-out' }
  if (a.status === 404 || d.code === 'invitation_not_found') return { kind: 'state', state: { kind: 'gone' } }
  if (d.code === 'invitation_other_address') return { kind: 'state', state: { kind: 'wrong-account', email: me.email, switchHref: urls.switchAccount } }
  if (d.code === 'email_not_verified') return { kind: 'state', state: { kind: 'unverified', email: me.email, verifyHref: urls.verify } }
  return { kind: 'error', message: errorText(a) }
}

export async function resolveInvitationState(o: InvitationDeps): Promise<InvitationState | { kind: 'joined'; to: string }> {
  if (!isInvitationToken(o.token)) return { kind: 'bad-link' }
  if (!o.me) return { kind: 'signed-out', signInHref: o.urls.signIn, registerHref: o.urls.register }
  const signedOut: InvitationState = { kind: 'signed-out', signInHref: o.urls.signIn, registerHref: o.urls.register }
  const found = await o.byToken(o.token)
  const d = (found.data && typeof found.data === 'object' ? found.data : {}) as { code?: unknown; invitation?: unknown; verified?: unknown }
  if (found.status === 401) return signedOut
  if (found.ok) {
    const invitation = parseInvitation(d.invitation)
    if (!invitation) return { kind: 'unavailable' }
    if (d.verified === false) return { kind: 'unverified', email: o.me.email, verifyHref: o.urls.verify, invitation }
    return { kind: 'ready', email: o.me.email, invitation, switchHref: o.urls.switchAccount }
  }
  if (d.code === 'invitation_not_found') return { kind: 'gone' }
  if (d.code === 'invitation_other_address') return { kind: 'wrong-account', email: o.me.email, switchHref: o.urls.switchAccount }
  if (found.status !== 404) return { kind: 'unavailable' }
  // An older jinbe without the look-up.
  if (!o.me.verified) {
    const out = acceptOutcome(await o.accept(o.token), o.me, o.urls)
    if (out.kind === 'joined') return out
    if (out.kind === 'state') return out.state
    if (out.kind === 'signed-out') return signedOut
    return { kind: 'unverified', email: o.me.email, verifyHref: o.urls.verify }
  }
  const mine = await o.mine()
  if (mine.status === 401) return signedOut
  if (!mine.ok && (mine.status === 0 || mine.status >= 500)) return { kind: 'unavailable' }
  const list: Invitation[] = mine.ok ? parseInvitations(mine.data) : []
  return { kind: 'ready', email: o.me.email, invitation: list.length === 1 ? list[0] : null, switchHref: o.urls.switchAccount }
}
