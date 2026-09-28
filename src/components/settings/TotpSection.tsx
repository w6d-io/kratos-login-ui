'use client'

import { useState } from 'react'
import type { SettingsFlow, UpdateSettingsFlowBody } from '@ory/client'
import { createBrowserClient } from '@/lib/kratos'
import { getCsrfToken, getInput, handleContinueWith } from '@/lib/kratos-flow'
import { flowContext, resolveKratosError, type FlowContext } from '@/lib/flow-nav'
import { applyNav, errorNavOptions } from '@/lib/flow-nav-browser'
import { TotpRow } from '@/components/settings/MfaViews'

/**
 * Every settings error goes through flow-nav: privileged-session refresh and
 * aal2 step-up come back to this exact page (flow + tab), an expired session
 * signs in and returns here, an expired flow restarts with its return_to.
 */
export function onSettingsError(err: unknown, ctx: FlowContext, fallback: string, refetch: () => void, setError?: (m: string) => void) {
  applyNav<SettingsFlow>(resolveKratosError(err, errorNavOptions('settings', ctx, fallback, window.location.href)), {
    setFlow: refetch,
    refetch,
    setError: setError ?? refetch,
  })
}

/**
 * A successful save: follow Kratos' continue_with (e.g. back to the site that
 * sent the user to enrol 2FA). An unverified address makes Kratos prepend
 * show_verification_ui to every save — only follow it for profile edits.
 */
export function onSettingsSaved(data: unknown, flow: SettingsFlow, method: string, refetch: () => void) {
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  if (handleContinueWith(data, flow.return_to, { skipVerification: method !== 'profile', currentSettingsFlowId: flow.id, hash })) return
  refetch()
}

/**
 * The authenticator-app row wired to a settings flow: enrol (scan + confirm)
 * or turn off. `onSaved` replaces the default continue_with handling — the
 * two-step gate re-checks instead of following the flow's return_to.
 */
export function MfaTotpSection({ flow, onChanged, onSaved }: { flow: SettingsFlow; onChanged: () => void; onSaved?: (data: unknown) => void }) {
  const totpInput = getInput(flow, 'totp_code')
  const totpUnlink = getInput(flow, 'totp_unlink')
  const enrolled = !!totpUnlink
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // QR + secret are exposed by Kratos as separate UI nodes when enrolling.
  const qrNode = (flow.ui?.nodes ?? []).find(
    (n) => n.group === 'totp' && n.type === 'img' && (n.attributes as { id?: string }).id === 'totp_qr',
  )
  const qrSrc = (qrNode?.attributes as { src?: string } | undefined)?.src
  const secretNode = (flow.ui?.nodes ?? []).find(
    (n) => n.group === 'totp' && n.type === 'text' && (n.attributes as { id?: string }).id === 'totp_secret_key',
  )
  const secret = (secretNode?.attributes as { text?: { text?: string } } | undefined)?.text?.text

  const submit = async (action: 'verify' | 'unlink') => {
    setSubmitting(true)
    try {
      const body = action === 'verify'
        ? { method: 'totp', totp_code: code, csrf_token: getCsrfToken(flow) }
        : { method: 'totp', totp_unlink: true, csrf_token: getCsrfToken(flow) }
      const { data } = await createBrowserClient().updateSettingsFlow({ flow: flow.id, updateSettingsFlowBody: body as UpdateSettingsFlowBody })
      setCode('')
      if (onSaved) onSaved(data)
      else onSettingsSaved(data, flow, 'totp', onChanged)
    } catch (err: unknown) {
      // Privileged-session check: TOTP enroll/unlink is sensitive, so Kratos
      // requires a recent re-auth (privileged_session_max_age) and answers
      // 403 session_refresh_required. 400: the updated flow carries the
      // field error ("the provided code did not match") — clear the stale
      // code (TOTP rotates every 30 s) and re-render.
      setCode('')
      onSettingsError(err, flowContext(flow), 'Could not update the authenticator app.', onChanged)
    } finally { setSubmitting(false) }
  }

  const totpErr = totpInput?.errors?.[0]
  const flowLevelErrs = (flow.ui?.messages || [])
    .filter((m) => m.type === 'error')
    .map((m) => m.text)

  return (
    <TotpRow
      enrolled={enrolled}
      canEnrol={!!totpInput}
      qrSrc={qrSrc}
      secret={secret}
      code={code}
      setCode={setCode}
      submitting={submitting}
      error={totpErr || flowLevelErrs[0]}
      onVerify={() => submit('verify')}
      onUnlink={() => submit('unlink')}
    />
  )
}
