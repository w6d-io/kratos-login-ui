'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { Loading } from '@/components/Loading'
import { FlowCard } from '@/components/flow/FlowCard'
import { Icons } from '@/components/ui/Icons'
import { AccountView, INVITATIONS_TAB, type AccountMe } from '@/components/account/AccountView'
import { change, signInAgain } from '@/components/account/AccountParts'
import { createBrowserClient } from '@/lib/kratos'
import { initFlowUrl } from '@/lib/ory'
import { accountApi, buildMyOrgs, errorText, isRole, isUuid, joinedUrl, parseInvitations, type Invitation, type MyOrg } from '@/lib/account'

type Data = { me: AccountMe; orgs: MyOrg[]; invitations: Invitation[] }

/** The signed-in person, from their Kratos session; null when signed out. */
async function whoAmI(): Promise<AccountMe | null> {
  try {
    const { data } = await createBrowserClient().toSession()
    const identity = data.identity
    const email = String((identity?.traits as { email?: unknown } | undefined)?.email ?? '')
    const verified = (identity?.verifiable_addresses ?? []).some((a) => a.value?.toLowerCase() === email.toLowerCase() && a.verified)
    return identity?.id ? { id: identity.id, email, verified } : null
  } catch {
    return null
  }
}

/** The tab named by the URL hash (#org-<id> or #invitations), when it is one of mine. */
function tabFromHash(d: Data): string | null {
  const h = window.location.hash.replace(/^#/, '')
  if (h === INVITATIONS_TAB && d.invitations.length) return INVITATIONS_TAB
  const id = h.startsWith('org-') ? h.slice(4) : ''
  return d.orgs.some((o) => o.id === id) ? id : null
}

function joinedFromUrl(): { orgId: string; dropped: string[] } | null {
  const q = new URLSearchParams(window.location.search)
  const orgId = q.get('joined')
  if (!isUuid(orgId)) return null
  return { orgId, dropped: (q.get('dropped') || '').split(',').filter(isRole) }
}

/**
 * "Your organizations": the invitations waiting for me and, for each organization I belong to,
 * what my permissions there let me see and do. Everything is asked of jinbe with my session.
 */
function AccountPageContent() {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  // Read once from the URL; nothing renders it before the data has loaded on the client.
  const [joined, setJoined] = useState<{ orgId: string; dropped: string[] } | null>(() => (typeof window === 'undefined' ? null : joinedFromUrl()))
  const [answering, setAnswering] = useState<string | null>(null)
  const [answerError, setAnswerError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const me = await whoAmI()
    if (!me) { signInAgain(); return }
    const [orgs, perms, jinbeOrgs, invitations] = await Promise.all([
      accountApi('GET', 'me/organizations'),
      accountApi('GET', 'me/permissions'),
      accountApi('GET', 'me/orgs?app=jinbe'),
      accountApi('GET', 'me/invitations'),
    ])
    if ([orgs, perms, invitations].some((a) => a.status === 401)) { signInAgain(); return }
    if (!orgs.ok || !perms.ok) { setFailed(true); return }
    const d: Data = {
      me,
      orgs: buildMyOrgs(orgs.data, perms.data, jinbeOrgs.ok ? jinbeOrgs.data : null),
      invitations: invitations.ok ? parseInvitations(invitations.data) : [],
    }
    setFailed(false)
    setData(d)
    setSelected((cur) => (cur && (cur === INVITATIONS_TAB ? d.invitations.length > 0 : d.orgs.some((o) => o.id === cur)) ? cur : null) ?? tabFromHash(d) ?? (d.invitations.length ? INVITATIONS_TAB : d.orgs[0]?.id ?? null))
  }, [])

  useEffect(() => { void load() }, [load])

  const select = (tab: string) => {
    setSelected(tab)
    setAnswerError(null)
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${tab === INVITATIONS_TAB ? INVITATIONS_TAB : `org-${tab}`}`)
  }

  const accept = async (i: Invitation) => {
    setAnswering(i.id)
    setAnswerError(null)
    const a = await change('POST', 'me/invitations/accept', { id: i.id })
    setAnswering(null)
    if (!a.ok) { setAnswerError(errorText(a)); return }
    const body = a.data as { organization?: { id?: unknown }; dropped?: unknown }
    const orgId = isUuid(body?.organization?.id) ? body.organization.id : i.org
    window.location.assign(joinedUrl(orgId, Array.isArray(body?.dropped) ? body.dropped.filter(isRole) : []))
  }

  const decline = async (i: Invitation) => {
    setAnswering(i.id)
    setAnswerError(null)
    const a = await change('POST', `me/invitations/${i.id}/decline`)
    setAnswering(null)
    if (!a.ok) { setAnswerError(errorText(a)); return }
    void load()
  }

  if (failed) {
    return (
      <FlowCard
        icon={<Icons.Plug size={20} />}
        title="We can’t load your organizations right now"
        subtitle="You’re signed in. Nothing is wrong with your account; try again in a moment."
        footer={<a href="/settings">Account settings</a>}
      >
        <button type="button" className="btn btn-primary btn-block" onClick={() => { setFailed(false); void load() }}>
          <Icons.RefreshCcw size={16} /> Try again
        </button>
      </FlowCard>
    )
  }
  if (!data) return <Loading />

  return (
    <AccountView
      me={data.me}
      orgs={data.orgs}
      invitations={data.invitations}
      selected={selected}
      onSelect={select}
      joined={joined}
      onDismissJoined={() => {
        setJoined(null)
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
      }}
      onAccept={(i) => void accept(i)}
      onDecline={(i) => void decline(i)}
      answering={answering}
      answerError={answerError}
      verifyHref={initFlowUrl('verification', typeof window !== 'undefined' ? window.location.href : undefined)}
    />
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AccountPageContent />
    </Suspense>
  )
}
