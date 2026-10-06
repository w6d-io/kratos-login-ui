'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loading } from '@/components/Loading'
import { InvitationView } from '@/components/account/InvitationView'
import { createBrowserClient } from '@/lib/kratos'
import { initFlowUrl } from '@/lib/ory'
import { accountApi, errorText } from '@/lib/account'
import { acceptOutcome, resolveInvitationState, type InvitationState, type Me } from '@/lib/invitation'

async function whoAmI(): Promise<Me | null> {
  try {
    const { data } = await createBrowserClient().toSession()
    const email = String((data.identity?.traits as { email?: unknown } | undefined)?.email ?? '')
    const verified = (data.identity?.verifiable_addresses ?? []).some((a) => a.value?.toLowerCase() === email.toLowerCase() && a.verified)
    return { email, verified }
  } catch {
    return null
  }
}

/**
 * The invitation link jinbe hands to the inviter (INVITATION_URL = <this UI>/invitation). Sign-in,
 * sign-up and verification all come back here; sign-up through this link is let in by jinbe's guard
 * for the invited address even when sign-up is otherwise closed.
 */
function InvitationPageContent() {
  const token = useSearchParams().get('token')
  const [state, setState] = useState<InvitationState | null>(null)
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const urls = useCallback(() => {
    const self = window.location.href
    return {
      signIn: initFlowUrl('login', self),
      register: initFlowUrl('registration', self),
      verify: initFlowUrl('verification', self),
      switchAccount: `/logout?return_to=${encodeURIComponent(`${window.location.origin}/login?return_to=${encodeURIComponent(self)}`)}`,
    }
  }, [])

  const run = useCallback(async () => {
    const me = await whoAmI()
    const next = await resolveInvitationState({
      token,
      me,
      byToken: (t) => accountApi('GET', `me/invitations/by-token?token=${encodeURIComponent(t)}`),
      accept: (t) => accountApi('POST', 'me/invitations/accept', { token: t }),
      mine: () => accountApi('GET', 'me/invitations'),
      urls: urls(),
    })
    if (next.kind === 'joined') { window.location.assign(next.to); return }
    setState(next)
  }, [token, urls])

  useEffect(() => { void run() }, [run])

  const accept = async () => {
    if (!state || state.kind !== 'ready' || !token) return
    setBusy('accept')
    setError(null)
    const out = acceptOutcome(await accountApi('POST', 'me/invitations/accept', { token }), { email: state.email, verified: true }, urls())
    setBusy(null)
    if (out.kind === 'joined') window.location.assign(out.to)
    else if (out.kind === 'state') setState(out.state)
    else if (out.kind === 'signed-out') void run()
    else setError(out.message)
  }

  const decline = async () => {
    if (!state || state.kind !== 'ready' || !state.invitation) return
    const inv = state.invitation
    setBusy('decline')
    setError(null)
    const a = await accountApi('POST', `me/invitations/${inv.id}/decline`)
    setBusy(null)
    if (a.ok) setState({ kind: 'declined', orgName: inv.orgName })
    else if (a.status === 404) setState({ kind: 'gone' })
    else setError(errorText(a))
  }

  if (!state) return <Loading />
  return (
    <InvitationView
      state={state}
      busy={busy}
      error={error}
      onAccept={() => void accept()}
      onDecline={() => void decline()}
      onRetry={() => { setState(null); void run() }}
    />
  )
}

export default function InvitationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <InvitationPageContent />
    </Suspense>
  )
}
