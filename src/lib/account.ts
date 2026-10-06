/**
 * The Account area's view of jinbe's answers (through /api/account, src/lib/account-server.ts):
 * parsing, what a permission lets the page offer, and refusals in words. jinbe decides; hiding an
 * action here only spares the person a refusal.
 */

export const ORG_PERMISSIONS = {
  membersRead: 'org.members:read',
  membersWrite: 'org.members:write',
  keysRead: 'org.keys:read',
  keysRevoke: 'org.keys:revoke',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ROLE = /^[a-z0-9][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
export const isRole = (v: unknown): v is string => typeof v === 'string' && ROLE.test(v)
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
export const isDomain = (v: unknown): v is string => typeof v === 'string' && DOMAIN.test(v)
export const isInvitationToken = (v: unknown): v is string => typeof v === 'string' && TOKEN.test(v)

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

// ── Calls ──────────────────────────────────────────────────────────────

export interface ApiAnswer<T = unknown> {
  ok: boolean
  status: number
  data: T
}

/** One call through /api/account. A network failure answers status 0. */
export async function accountApi<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<ApiAnswer<T>> {
  try {
    const res = await fetchImpl(`/api/account/${path}`, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    let data: unknown = null
    if (res.status !== 204) {
      try { data = await res.json() } catch { data = null }
    }
    return { ok: res.ok, status: res.status, data: data as T }
  } catch {
    return { ok: false, status: 0, data: null as T }
  }
}

// ── Organizations ──────────────────────────────────────────────────────

export interface MyOrg {
  id: string
  name: string
  /** My org roles (`svc:role`) as far as they are known. */
  roles: string[]
  /** What I may do here (`org.members:write`, …). */
  permissions: string[]
}

/**
 * My organizations from GET me/organizations (ids, names), me/permissions (orgPermissions) and
 * me/orgs?app=jinbe (my org-management roles). Missing parts leave the org with less, never more.
 */
export function buildMyOrgs(orgs: unknown, perms: unknown, jinbeOrgs: unknown): MyOrg[] {
  const o = obj(orgs)
  const names = obj(o.names)
  const orgPermissions = obj(obj(perms).orgPermissions)
  const roles = new Map<string, string[]>()
  for (const e of Array.isArray(obj(jinbeOrgs).organizations) ? (obj(jinbeOrgs).organizations as unknown[]) : []) {
    const id = str(obj(e).id)
    if (id) roles.set(id, strs(obj(e).roles).filter(isRole))
  }
  return strs(o.organizations)
    .filter((id, i, all) => id && all.indexOf(id) === i)
    .map((id) => ({
      id,
      name: str(names[id]).trim() || 'Unnamed organization',
      roles: roles.get(id) ?? [],
      permissions: strs(orgPermissions[id]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const can = (org: Pick<MyOrg, 'permissions'>, permission: string) => org.permissions.includes(permission)

// ── Roles ──────────────────────────────────────────────────────────────

/** jinbe's own org roles, said plainly. Other sites' roles show their name. */
const JINBE_ROLES: Record<string, { label: string; hint: string }> = {
  owner: { label: 'Owner', hint: 'Everything in this organization' },
  member_manager: { label: 'Member manager', hint: 'Invite and remove members, change their roles' },
  key_manager: { label: 'Key manager', hint: 'See and revoke API keys' },
  auditor: { label: 'Auditor', hint: 'See the activity log and the members' },
  viewer: { label: 'Viewer', hint: 'See members and keys' },
}

const words = (s: string) => {
  const w = s.replace(/[_-]+/g, ' ').trim()
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** `jinbe:member_manager` → "Member manager"; `shop:editor` → "Editor" in "shop". */
export function roleLabel(role: string): { label: string; app: string | null; hint: string | null } {
  const [svc, name = ''] = role.split(':')
  if (svc === 'jinbe' && JINBE_ROLES[name]) return { ...JINBE_ROLES[name], app: null }
  return { label: words(name || svc), app: svc === 'jinbe' ? null : svc, hint: null }
}

export function roleText(role: string): string {
  const { label, app } = roleLabel(role)
  return app ? `${label} (${app})` : label
}

export interface OrgRoleOption {
  role: string
  permissions: string[]
  assignable: boolean
}

export function parseRoleOptions(raw: unknown): OrgRoleOption[] {
  const list = Array.isArray(obj(raw).roles) ? (obj(raw).roles as unknown[]) : []
  return list
    .map((e) => ({ role: str(obj(e).role), permissions: strs(obj(e).permissions), assignable: obj(e).assignable === true }))
    .filter((e) => isRole(e.role))
}

export interface RoleRefusal {
  role: string
  reason: string
  missing: string[]
}

export function parseRefusals(raw: unknown): RoleRefusal[] {
  const list = Array.isArray(obj(raw).refused) ? (obj(raw).refused as unknown[]) : []
  return list.map((e) => ({ role: str(obj(e).role), reason: str(obj(e).reason), missing: strs(obj(e).missing) })).filter((e) => e.role)
}

/** Why one role could not be given, in words. */
export function refusalText(r: RoleRefusal): string {
  const role = roleText(r.role)
  switch (r.reason) {
    case 'unknown_role':
      return `${role}: this role doesn’t exist here.`
    case 'org_not_entitled':
      return `${role}: this organization doesn’t use that app.`
    case 'grantee_not_member':
      return `${role}: they need to be a member first.`
    case 'grant_permission_missing':
      return `${role}: you can’t change roles in this organization.`
    default:
      return `${role}: you can only give a role whose rights you hold yourself.`
  }
}

// ── Members, invitations, keys, domains ────────────────────────────────

export interface Member {
  id: string
  email: string
  name: string
  roles: string[]
  active: boolean
}

export function parseMembers(raw: unknown): Member[] {
  const list = Array.isArray(obj(raw).data) ? (obj(raw).data as unknown[]) : []
  return list
    .map((e) => {
      const m = obj(e)
      const traits = obj(m.traits)
      const name = typeof traits.name === 'string' ? traits.name : [str(obj(traits.name).first), str(obj(traits.name).last)].join(' ')
      return { id: str(m.id), email: str(traits.email), name: name.trim(), roles: strs(m.roles).filter(isRole), active: m.state !== 'inactive' }
    })
    .filter((m) => isUuid(m.id))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
}

export interface Invitation {
  id: string
  org: string
  orgName: string
  email: string
  roles: string[]
  invitedBy: string
  expiresAt: string
}

export function parseInvitation(e: unknown): Invitation | null {
  const i = obj(e)
  const inv = {
    id: str(i.id),
    org: str(i.org),
    orgName: str(i.organizationName).trim(),
    email: str(i.email),
    roles: strs(i.roles).filter(isRole),
    invitedBy: i.byPlatform === true ? '' : str(obj(i.invitedBy).email),
    expiresAt: str(i.expiresAt),
  }
  return isUuid(inv.id) ? inv : null
}

export function parseInvitations(raw: unknown): Invitation[] {
  const list = Array.isArray(obj(raw).invitations) ? (obj(raw).invitations as unknown[]) : []
  return list.map(parseInvitation).filter((i): i is Invitation => i !== null)
}

/** The new invitation and its one-time link (or token, when jinbe has no link to give). */
export function parseCreatedInvitation(raw: unknown): { invitation: Invitation; link: string } | null {
  const o = obj(raw)
  const invitation = parseInvitation(o.invitation)
  const link = /^https?:\/\//.test(str(o.link)) ? str(o.link) : str(o.token)
  return invitation && link ? { invitation, link } : null
}

export interface ApiKey {
  clientId: string
  label: string
  scopes: string[]
  createdBy: string
  createdAt: string | null
  expiresAt: string | null
  lastUsedAt: string | null
  expired: boolean
}

export function parseApiKeys(raw: unknown, now = Date.now()): ApiKey[] {
  const list = Array.isArray(obj(raw).data) ? (obj(raw).data as unknown[]) : []
  return list
    .map((e) => {
      const k = obj(e)
      return {
        clientId: str(k.client_id),
        label: str(k.label).trim(),
        scopes: strs(k.scopes),
        createdBy: str(k.created_by_email),
        createdAt: str(k.created_at) || null,
        expiresAt: str(k.expires_at) || null,
        lastUsedAt: str(k.last_used_at) || null,
        expired: !!str(k.expires_at) && Date.parse(str(k.expires_at)) < now,
      }
    })
    .filter((k) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(k.clientId))
}

export interface EmailDomain {
  domain: string
  verified: boolean
  record: { name: string; value: string } | null
}

export function parseDomain(e: unknown): EmailDomain | null {
  const d = obj(e)
  const rec = obj(d.record)
  const domain = str(d.domain)
  if (!domain) return null
  return { domain, verified: d.verified === true, record: str(rec.name) && str(rec.value) ? { name: str(rec.name), value: str(rec.value) } : null }
}

export function parseDomains(raw: unknown): EmailDomain[] {
  const list = Array.isArray(obj(raw).domains) ? (obj(raw).domains as unknown[]) : []
  return list.map(parseDomain).filter((d): d is EmailDomain => d !== null)
}

// ── Errors in words ────────────────────────────────────────────────────

/** A refusal or failure of any Account call, in words. */
export function errorText(a: ApiAnswer, fallback = 'That didn’t work. Try again in a moment.'): string {
  const d = obj(a.data)
  const code = str(d.code) || str(d.error)
  if (a.status === 0 || a.status === 503) return 'We can’t reach the server right now. Try again in a moment.'
  switch (code) {
    case 'already_member': return 'This person is already a member.'
    case 'domain_taken': return 'Another organization has already proven this domain.'
    case 'record_not_found': return 'The TXT record isn’t there yet. DNS changes can take a few minutes; try again shortly.'
    case 'not_claimed': return 'This domain isn’t claimed by this organization.'
    case 'invitation_not_found': return 'This invitation has expired, was taken back, or has already been used.'
    case 'invitation_other_address': return 'This invitation is for another email address.'
    case 'email_not_verified': return 'Verify your email address first.'
  }
  if (a.status === 403) {
    const refused = parseRefusals(a.data)
    if (refused.length) return refused.map(refusalText).join(' ')
    return 'You’re not allowed to do this here.'
  }
  if (a.status === 404) return 'It’s no longer there. Refresh the page.'
  if (a.status === 400) return 'Check what you entered and try again.'
  return fallback
}

// ── Dates ──────────────────────────────────────────────────────────────

export function shortDate(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Links ──────────────────────────────────────────────────────────────

export const ACCOUNT_PATH = '/account'
export const INVITATION_PATH = '/invitation'

/** Where an accepted invitation lands: the account page on that org, naming roles that were dropped. */
export function joinedUrl(orgId: string, dropped: string[]): string {
  const q = new URLSearchParams({ joined: orgId })
  const d = dropped.filter(isRole)
  if (d.length) q.set('dropped', d.join(','))
  return `${ACCOUNT_PATH}?${q.toString()}#org-${orgId}`
}

/** Whether a return_to is this UI's own invitation link (sign-up through an invitation). */
export function isInvitationLink(url: string | null | undefined, origin: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url, origin)
    return u.origin === origin && u.pathname === INVITATION_PATH && isInvitationToken(u.searchParams.get('token'))
  } catch {
    return false
  }
}
