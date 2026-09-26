'use client'

import { env } from 'next-runtime-env'
import type { SettingsFlow } from '@ory/client'
import { Icons } from '@/components/ui/Icons'
import { WebAuthnTriggerForm } from '@/components/ui/OryWebAuthn'
import { OtpInput } from '@/components/ui/OtpInput'
import { CopyButton } from '@/components/flow/Parts'
import { RecoveryCodes } from '@/components/flow/TwoFactor'
import type { PasskeyCredential } from '@/lib/kratos-flow'

function Spinner() {
  return <span className="spinner" aria-hidden />
}

/** Authenticator app: status row, or a two-step enrolment (scan, then confirm a code). */
export function TotpRow({ enrolled, canEnrol, qrSrc, secret, code, setCode, submitting, error, onVerify, onUnlink }: {
  enrolled: boolean
  canEnrol: boolean
  qrSrc?: string
  secret?: string
  code: string
  setCode: (v: string) => void
  submitting: boolean
  error?: string
  onVerify: () => void
  onUnlink: () => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden><Icons.Smartphone size={18} /></div>
      <div className="settings-row-content">
        <div className="settings-row-title">
          Authenticator app {enrolled ? <span className="badge success">On</span> : <span className="badge">Off</span>}
        </div>
        <div className="settings-row-meta">
          {enrolled
            ? 'You’ll be asked for a 6-digit code from your app when you sign in.'
            : 'Get a new 6-digit code every 30 seconds from an app like 1Password, Authy or Google Authenticator.'}
        </div>
        {!enrolled && canEnrol && (
          <form className="enrol" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) onVerify() }} noValidate>
            <div className="enrol-step">
              <span className="enrol-num" aria-hidden>1</span>
              <div>
                <div className="enrol-step-title">Scan this code with your authenticator app</div>
                <div className="enrol-step-body">In the app, choose “Add account” or “+”, then scan.</div>
                <div className="enrol-qr">
                  {qrSrc && <img src={qrSrc} alt="QR code to add this account to an authenticator app" width={168} height={168} />}
                  {secret && (
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div className="enrol-step-body" style={{ marginTop: 0 }}>Can’t scan? Enter this key instead:</div>
                      <div className="secret">
                        <code aria-label="Setup key">{secret}</code>
                        <CopyButton text={secret} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="enrol-step">
              <span className="enrol-num" aria-hidden>2</span>
              <div>
                <label className="enrol-step-title" htmlFor="totp-enrol">Enter the 6-digit code the app shows</label>
                <div className="enrol-step-body" id="totp-enrol-hint">
                  {error
                    ? <span className="field-error" role="alert"><Icons.AlertCircle size={13} /> <span>{error} Codes change every 30 seconds — wait for a fresh one.</span></span>
                    : 'This confirms the app is set up correctly.'}
                </div>
                <div className="mt-3" style={{ maxWidth: 340 }}>
                  <OtpInput id="totp-enrol" value={code} onChange={setCode} autoFocus={false} aria-describedby="totp-enrol-hint" aria-invalid={!!error} />
                </div>
                <button type="submit" className="btn btn-primary mt-3" disabled={submitting || code.length < 6}>
                  {submitting ? <><Spinner /> Checking…</> : 'Turn on'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
      {enrolled && (
        <div className="settings-row-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onUnlink} disabled={submitting}>
            {submitting ? <Spinner /> : 'Turn off'}
          </button>
        </div>
      )}
    </div>
  )
}

export function PasskeysRow({ flow, passkeys, removing, onRemove }: {
  flow: SettingsFlow
  passkeys: PasskeyCredential[]
  removing: string | null
  onRemove: (id: string) => void
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden><Icons.Fingerprint size={18} /></div>
      <div className="settings-row-content">
        <div className="settings-row-title">
          Passkeys {passkeys.length > 0 ? <span className="badge success">{passkeys.length} added</span> : <span className="badge">None</span>}
        </div>
        <div className="settings-row-meta">
          Sign in with Face ID, Touch ID, Windows Hello or a security key — no password to type or leak.
        </div>
        {passkeys.length > 0 && (
          <ul className="stack mt-3" style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
            {passkeys.map((pk) => (
              <li key={pk.id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="row" style={{ minWidth: 0 }}>
                  <Icons.Key size={14} />
                  <span style={{ fontWeight: 500 }}>{pk.label}</span>
                  {pk.addedAt && <span className="small muted">added {new Date(pk.addedAt).toLocaleDateString()}</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={removing === pk.id}
                  onClick={() => onRemove(pk.id)}
                  aria-label={`Remove passkey ${pk.label}`}
                >
                  {removing === pk.id ? <Spinner /> : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Enrolment is a native form POST driven by Ory's webauthn.js: the browser creates the
          credential, the script fills passkey_settings_register and submits — Kratos 303s back
          to /settings?flow=… which this page already handles. */}
      <div className="settings-row-actions">
        <WebAuthnTriggerForm flow={flow} group="passkey" triggerName="passkey_register_trigger" className="btn btn-secondary btn-sm">
          <Icons.Plus size={14} /> Add passkey
        </WebAuthnTriggerForm>
      </div>
    </div>
  )
}

export function BackupCodesRow({ codes, account, canReveal, canRegenerate, needsConfirm, submitting, onReveal, onRegenerate, onConfirm }: {
  codes: string[]
  account: string
  canReveal: boolean
  canRegenerate: boolean
  needsConfirm: boolean
  submitting: boolean
  onReveal: () => void
  onRegenerate: () => void
  onConfirm: () => void
}) {
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  return (
    <div className="settings-row">
      <div className="settings-row-icon" aria-hidden><Icons.ShieldCheck size={18} /></div>
      <div className="settings-row-content">
        <div className="settings-row-title">Backup codes</div>
        <div className="settings-row-meta">
          Your way back in if you lose your phone or key. Each code works once — keep them in a password manager or print them.
        </div>
        {codes.length > 0 && (
          <>
            {needsConfirm && (
              <p className="small mt-3" style={{ color: 'var(--color-warning)', margin: 'var(--space-3) 0 0' }}>
                These codes aren’t active yet. Save them, then confirm below.
              </p>
            )}
            <RecoveryCodes codes={codes} appName={appName} account={account} />
            {needsConfirm && (
              <button type="button" className="btn btn-primary mt-3" disabled={submitting} onClick={onConfirm}>
                {submitting ? <Spinner /> : null} I’ve saved them — activate codes
              </button>
            )}
          </>
        )}
      </div>
      <div className="settings-row-actions">
        {canReveal && codes.length === 0 && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={onReveal}>Show codes</button>
        )}
        {canRegenerate && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={submitting} onClick={onRegenerate}>
            {codes.length > 0 || canReveal ? 'Get a new set' : 'Create codes'}
          </button>
        )}
      </div>
    </div>
  )
}
