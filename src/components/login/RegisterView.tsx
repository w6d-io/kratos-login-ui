'use client'

import type { FormEvent } from 'react'
import Link from 'next/link'
import { env } from 'next-runtime-env'
import type { RegistrationFlow } from '@ory/client'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icons } from '@/components/ui/Icons'
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo'
import { WebAuthnTriggerForm } from '@/components/ui/OryWebAuthn'
import { useBranding } from '@/components/ui/Branding'
import { FlowCard } from '@/components/flow/FlowCard'
import { FlowMessages } from '@/components/flow/FlowMessages'
import { AccountChip, MethodContent, PasswordRules } from '@/components/flow/Parts'
import { fieldLabel } from '@/components/flow/labels'
import { rememberMethod } from '@/components/flow/prefs'
import { getInputs, type FlowField, type OidcProvider } from '@/lib/kratos-flow'
import type { FlowBanner } from '@/lib/flow-messages'

export function humanizeTrait(name: string): string {
  // 'traits.email' → 'Email', 'traits.name.first' → 'First'
  const last = name.split('.').pop() || name
  return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Autocomplete hints for common trait names, when Kratos' schema gives none. */
function autocompleteFor(f: FlowField): string | undefined {
  if (f.autocomplete) return f.autocomplete
  const n = f.name.toLowerCase()
  if (n.endsWith('email')) return 'email'
  if (n.endsWith('first') || n.endsWith('first_name') || n.endsWith('given_name')) return 'given-name'
  if (n.endsWith('last') || n.endsWith('last_name') || n.endsWith('family_name')) return 'family-name'
  if (n.endsWith('name')) return 'name'
  if (n.endsWith('phone')) return 'tel'
  if (n.endsWith('username')) return 'username'
  return undefined
}

export function RegisterView(p: {
  flow: RegistrationFlow
  banners: FlowBanner[]
  networkError: string | null
  submitting: boolean
  oidc: OidcProvider[]
  traitFields: FlowField[]
  traits: Record<string, string>
  setTrait: (name: string, value: string) => void
  password: string
  setPassword: (v: string) => void
  accepted: boolean
  setAccepted: (v: boolean) => void
  hasPassword: boolean
  hasProfileStep: boolean
  hasPasskey: boolean
  returnTo: string
  /** Where "Sign in" goes; defaults to /login keeping return_to. */
  signInHref?: string
  onSubmit: (e: FormEvent) => void | Promise<void>
  onSubmitOidc: (provider: string) => void
}) {
  const { flow } = p
  const { branding } = useBranding()
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  const email = Object.entries(p.traits).find(([k]) => k.endsWith('email'))?.[1] ?? ''
  const pwError = getInputs(flow, 'password').find((f) => f.name === 'password')?.errors[0]
  const twoStep = p.hasProfileStep && !p.hasPassword
  // Second screen of the two-step flow: the details are already captured (echoed back hidden).
  const credentialStep = (p.hasPassword || p.hasPasskey) && p.traitFields.length > 0 && p.traitFields.every((f) => f.type === 'hidden')
  const restart = `/register${p.returnTo ? `?return_to=${encodeURIComponent(p.returnTo)}` : ''}`
  const showForm = p.hasPassword || p.hasProfileStep || p.traitFields.length > 0
  const blockedByTerms = p.hasPassword && !p.accepted

  return (
    <FlowCard
      title={credentialStep ? 'Choose how you’ll sign in' : 'Create your account'}
      subtitle={credentialStep
        ? 'Last step. Set a password, or use a passkey so there’s nothing to remember.'
        : branding
        ? `One ${appName} account gets you into ${branding.displayName} and the other apps you’re given.`
        : `It takes about a minute. You’ll use this ${appName} account to sign in.`}
      footer={<>Already have an account? <Link href={p.signInHref ?? `/login${p.returnTo ? `?return_to=${encodeURIComponent(p.returnTo)}` : ''}`}>Sign in</Link></>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet={credentialStep} />
      {credentialStep && <AccountChip identifier={email} switchHref={restart} switchLabel="Change" />}

      {p.oidc.length > 0 && !credentialStep && (
        <>
          <div className="method-list">
            {p.oidc.map((o) => (
              <button
                key={o.provider}
                type="button"
                className="method-btn"
                onClick={() => { rememberMethod(`oidc:${o.provider.toLowerCase()}`); p.onSubmitOidc(o.provider) }}
              >
                <MethodContent icon={<ProviderLogo name={o.provider} size={18} />} title={`Sign up with ${providerLabel(o.provider)}`} />
              </button>
            ))}
          </div>
          {showForm && <div className="divider-text">or sign up with email</div>}
        </>
      )}

      {showForm && (
        <form onSubmit={p.onSubmit} noValidate>
          {twoStep && <p className="small muted" style={{ margin: '0 0 var(--space-4)' }}>Step 1 of 2 — your details. Next you’ll choose a password or passkey.</p>}
          {!credentialStep && p.traitFields.map((f) => {
            const fieldId = `reg-${f.name.replace(/\W/g, '-')}`
            const isEmail = f.type === 'email' || f.name.endsWith('email')
            return (
              <Field
                key={f.name}
                label={fieldLabel(f.label, humanizeTrait(f.name))}
                optional={!f.required && !isEmail}
                htmlFor={fieldId}
                error={f.errors[0]}
                hint={isEmail ? 'We’ll send a code to confirm it’s yours.' : undefined}
              >
                <input
                  id={fieldId}
                  name={f.name}
                  type={isEmail ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                  inputMode={isEmail ? 'email' : f.type === 'tel' ? 'tel' : undefined}
                  className="input"
                  value={p.traits[f.name] || ''}
                  onChange={(e) => p.setTrait(f.name, e.target.value)}
                  autoComplete={autocompleteFor(f)}
                  autoCapitalize={isEmail ? 'none' : undefined}
                  spellCheck={isEmail ? false : undefined}
                  required={f.required}
                />
              </Field>
            )
          })}

          {/* Lets a password manager file the new password under the right account. */}
          {credentialStep && <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />}
          {p.hasPassword && (
            <Field
              label="Password"
              htmlFor="reg-pw"
              error={pwError}
              after={<PasswordRules password={p.password} identifier={email} id="reg-pw-rules" />}
            >
              <PasswordInput
                id="reg-pw"
                name="password"
                value={p.password}
                onChange={p.setPassword}
                autoComplete="new-password"
                aria-describedby="reg-pw-rules"
                required
              />
            </Field>
          )}

          {p.hasPassword && (
            <div className="mt-4">
              <Checkbox checked={p.accepted} onChange={p.setAccepted}>
                I agree to the terms of service and the privacy policy.
              </Checkbox>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || blockedByTerms} aria-describedby={blockedByTerms ? 'reg-terms-hint' : undefined}>
              {p.submitting
                ? <><span className="spinner" aria-hidden /> {p.hasPassword ? 'Creating account…' : 'Continuing…'}</>
                : p.hasPassword ? 'Create account' : 'Continue'}
            </button>
            {blockedByTerms && <p id="reg-terms-hint" className="small muted text-center" style={{ margin: 0 }}>Tick the box above to continue.</p>}
          </div>
        </form>
      )}

      {/* Passkey sign-up. In the two-step flow Kratos only exposes the trigger on the credentials
          step, where the chosen traits are echoed back as hidden `default`-group inputs; local
          edits override them so the ceremony POST carries what's on screen. */}
      {p.hasPasskey && (
        <>
          <div className="divider-text">or skip the password</div>
          <WebAuthnTriggerForm
            flow={flow}
            group="passkey"
            triggerName="passkey_register_trigger"
            className="method-btn"
            onTrigger={() => rememberMethod('passkey')}
            extra={Object.fromEntries(Object.entries(p.traits).filter(([k, v]) => k.startsWith('traits.') && v))}
          >
            <MethodContent icon={<Icons.Fingerprint size={18} />} title="Sign up with a passkey" hint="Use Face ID, Touch ID or Windows Hello — nothing to remember" />
          </WebAuthnTriggerForm>
        </>
      )}
    </FlowCard>
  )
}
