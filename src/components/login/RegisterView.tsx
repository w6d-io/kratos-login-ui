'use client'

import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { env } from 'next-runtime-env'
import type { RegistrationFlow } from '@ory/client'
import { Field } from '@/components/ui/Field'
import { OtpInput } from '@/components/ui/OtpInput'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Checkbox } from '@/components/ui/Checkbox'
import { Icons } from '@/components/ui/Icons'
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo'
import { WebAuthnTriggerForm } from '@/components/ui/OryWebAuthn'
import { useBranding } from '@/components/ui/Branding'
import { FlowCard } from '@/components/flow/FlowCard'
import { FlowMessages } from '@/components/flow/FlowMessages'
import { AccountChip, MethodContent, PasswordRules, ResendCode } from '@/components/flow/Parts'
import { fieldLabel } from '@/components/flow/labels'
import { rememberMethod } from '@/components/flow/prefs'
import { getInputs, type FlowField, type OidcProvider } from '@/lib/kratos-flow'
import type { FlowBanner } from '@/lib/flow-messages'
import { isBotCheckRefusal } from '@/lib/sign-in-protection'
import { nextStepText, type SignUpMethod } from '@/lib/sign-up-methods'

export function humanizeTrait(name: string): string {
  // 'traits.email' → 'Email', 'traits.name.first' → 'First'
  const last = name.split('.').pop() || name
  return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** The label a person reads: "Your name" for the name, Kratos' title (normalised) otherwise. */
function traitLabel(f: FlowField): string {
  if (f.name === 'traits.name') return 'Your name'
  return fieldLabel(f.label, humanizeTrait(f.name))
}

/** The credential step's subtitle, naming only what this flow offers. */
export function credentialStepText(password: boolean, passkey: boolean, code: boolean): string {
  if (password && passkey) return 'Last step. Set a password, or use a passkey so there’s nothing to remember.'
  if (password && code) return 'Last step. Set a password, or get a 6-digit code by email instead.'
  if (password) return 'Last step. Set the password you’ll sign in with.'
  if (passkey && code) return 'Last step. Use a passkey, or get a 6-digit code by email instead.'
  return 'Last step. Use a passkey so there’s nothing to remember.'
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
  /** How the account will sign in (the flow's methods, else what the identity schema allows): the details step says what comes next. */
  upcoming?: SignUpMethod[] | null
  returnTo: string
  /** Where "Sign in" goes; defaults to /login keeping return_to. */
  signInHref?: string
  onSubmit: (e: FormEvent) => void | Promise<void>
  onSubmitOidc: (provider: string) => void
  /** The bot-check widget, on the step that creates the account; null when sign-up asks for none. */
  botCheck?: ReactNode
  /** The check is shown and not solved yet: the submit waits for it. */
  botCheckPending?: boolean
  /** "Sign-ups are limited to @corp.io addresses." — said under the email field before anyone types. */
  signUpLimit?: string | null
  /** Email-code sign-up (Kratos `code` method): offered (`send`), or a code was sent (`enter`). */
  codeStage?: 'none' | 'send' | 'enter'
  code?: string
  setCode?: (v: string) => void
  onSendCode?: () => void | Promise<void>
  onSubmitCode?: (e: FormEvent) => void | Promise<void>
  onResendCode?: () => void | Promise<unknown>
}) {
  const { flow } = p
  const { branding } = useBranding()
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  const email = Object.entries(p.traits).find(([k]) => k.endsWith('email'))?.[1] ?? ''
  const pwError = getInputs(flow, 'password').find((f) => f.name === 'password')?.errors[0]
  const twoStep = p.hasProfileStep && !p.hasPassword
  // Second screen of the two-step flow: the details are already captured (echoed back hidden).
  const offersCode = p.codeStage === 'send'
  const credentialStep = (p.hasPassword || p.hasPasskey || offersCode) && p.traitFields.length > 0 && p.traitFields.every((f) => f.type === 'hidden')
  const restart = `/register${p.returnTo ? `?return_to=${encodeURIComponent(p.returnTo)}` : ''}`
  // Only an email code on offer (no password): its button is the whole form.
  const codeOnly = credentialStep && offersCode && !p.hasPassword
  const showForm = !codeOnly && (p.hasPassword || p.hasProfileStep || p.traitFields.length > 0)
  const blockedByTerms = p.hasPassword && !p.accepted
  const blockedByBotCheck = !blockedByTerms && !!p.botCheckPending

  if (p.codeStage === 'enter') return <RegisterCodeStep {...p} email={email} restart={restart} />

  return (
    <FlowCard
      title={credentialStep ? 'Choose how you’ll sign in' : 'Create your account'}
      subtitle={credentialStep
        ? codeOnly
          ? 'Last step. We’ll email you a 6-digit code to confirm the address and create the account.'
          : credentialStepText(p.hasPassword, p.hasPasskey, offersCode)
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
          {twoStep && <p className="small muted" style={{ margin: '0 0 var(--space-4)' }}>Step 1 of 2 — your details. {nextStepText(p.upcoming ?? null)}</p>}
          {!credentialStep && p.traitFields.map((f) => {
            const fieldId = `reg-${f.name.replace(/\W/g, '-')}`
            const isEmail = f.type === 'email' || f.name.endsWith('email')
            return (
              <Field
                key={f.name}
                label={traitLabel(f)}
                optional={!f.required && !isEmail}
                htmlFor={fieldId}
                error={f.errors[0]}
                hint={isEmail ? (p.signUpLimit ? `${p.signUpLimit} We’ll send a code to confirm it’s yours.` : 'We’ll send a code to confirm it’s yours.') : undefined}
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

          {p.botCheck && <div className="mt-4">{p.botCheck}</div>}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || blockedByTerms || blockedByBotCheck} aria-describedby={blockedByTerms ? 'reg-terms-hint' : blockedByBotCheck ? 'reg-bot-hint' : undefined}>
              {p.submitting
                ? <><span className="spinner" aria-hidden /> {p.hasPassword ? 'Creating account…' : 'Continuing…'}</>
                : p.hasPassword ? 'Create account' : 'Continue'}
            </button>
            {blockedByTerms && <p id="reg-terms-hint" className="small muted text-center" style={{ margin: 0 }}>Tick the box above to continue.</p>}
            {blockedByBotCheck && <p id="reg-bot-hint" className="small muted text-center" style={{ margin: 0 }}>Complete the bot check above to continue.</p>}
          </div>
        </form>
      )}

      {credentialStep && offersCode && (
        <>
          {!codeOnly && <div className="divider-text">or skip the password</div>}
          <button
            type="button"
            className={codeOnly ? 'btn btn-primary btn-block' : 'method-btn'}
            disabled={p.submitting || !!p.botCheckPending}
            onClick={() => { rememberMethod('code'); void p.onSendCode?.() }}
          >
            {codeOnly
              ? (p.submitting ? <><span className="spinner" aria-hidden /> Sending…</> : 'Email me a code')
              : <MethodContent icon={<Icons.Mail size={18} />} title="Email me a code instead" hint="Confirm the address with a 6-digit code — nothing to remember" />}
          </button>
          {/* Emailing the code is checked by the gateway: the widget sits in the form above, or here. */}
          {codeOnly && p.botCheck && <div className="mt-4">{p.botCheck}</div>}
          {codeOnly && p.botCheckPending && <p className="small muted text-center" style={{ margin: 'var(--space-2) 0 0' }}>Complete the bot check to get your code.</p>}
        </>
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

/** Sign-up is closed (console: Settings → Sign-in protection): say so instead of a form Kratos would refuse. */
export function SignUpClosedView({ message, signInHref }: { message: string; signInHref: string }) {
  return (
    <FlowCard
      icon={<Icons.Lock size={20} />}
      title="Sign-ups are closed"
      subtitle={message}
      footer={<>Already have an account? <Link href={signInHref}>Sign in</Link></>}
    >
      <Link href={signInHref} className="btn btn-primary btn-block">Go to sign in</Link>
    </FlowCard>
  )
}

/**
 * The code was sent: type it to create the account. This submit is the one Kratos hands to jinbe's
 * hook, so the bot check sits here too (sending was checked by the gateway, and so is a resend).
 */
function RegisterCodeStep(p: Parameters<typeof RegisterView>[0] & { email: string; restart: string }) {
  const code = p.code ?? ''
  const codeError = getInputs(p.flow, 'code').find((f) => f.name === 'code')?.errors[0]
  const blockedByTerms = !p.accepted
  const blockedByBotCheck = !blockedByTerms && !!p.botCheckPending
  // Kratos spends the code on a submit the hook refused (verified on v26.2.0): only a new one works.
  const codeSpent = isBotCheckRefusal(p.flow)
  return (
    <FlowCard
      icon={<Icons.Inbox size={20} />}
      title="Check your email"
      subtitle={<>Enter the 6-digit code we sent to <strong>{p.email || 'your email'}</strong> to create your account.</>}
      footer={<Link href={p.restart}>Use a different email</Link>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
      {codeSpent && <p className="small muted" role="status" style={{ margin: '0 0 var(--space-4)' }}>That code can’t be used again. Send a new code below, complete the bot check, then enter the new code.</p>}
      {/* A full code submits the form by itself (OtpInput) — only once nothing else is missing, since
          that path does not go through the disabled button. */}
      <form onSubmit={(e) => { if (blockedByTerms || blockedByBotCheck) { e.preventDefault(); return } return p.onSubmitCode?.(e) }} noValidate>
        <Field label="6-digit code" htmlFor="reg-code" error={codeError} hint="It can take a minute to arrive. Not there? Check spam or promotions.">
          <OtpInput id="reg-code" value={code} onChange={(v) => p.setCode?.(v)} autoSubmit={!blockedByTerms && !blockedByBotCheck} />
        </Field>
        <div className="mt-4">
          <Checkbox checked={p.accepted} onChange={p.setAccepted}>
            I agree to the terms of service and the privacy policy.
          </Checkbox>
        </div>
        {p.botCheck && <div className="mt-4">{p.botCheck}</div>}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={p.submitting || code.length !== 6 || blockedByTerms || blockedByBotCheck}
            aria-describedby={blockedByTerms ? 'reg-code-terms-hint' : blockedByBotCheck ? 'reg-code-bot-hint' : undefined}
          >
            {p.submitting ? <><span className="spinner" aria-hidden /> Creating account…</> : 'Create account'}
          </button>
          {blockedByTerms && <p id="reg-code-terms-hint" className="small muted text-center" style={{ margin: 0 }}>Tick the box above to continue.</p>}
          {blockedByBotCheck && <p id="reg-code-bot-hint" className="small muted text-center" style={{ margin: 0 }}>Complete the bot check above to continue.</p>}
        </div>
      </form>
      {p.onResendCode && (
        <div className="mt-4">
          {/* A resend is another email: it waits for the bot check like the first one. */}
          {p.botCheckPending
            ? <p className="small muted" style={{ margin: 0 }}>Complete the bot check above to send another code.</p>
            : <ResendCode onResend={p.onResendCode} cooldownKey={`reg-code:${p.flow.id}`} />}
        </div>
      )}
    </FlowCard>
  )
}
