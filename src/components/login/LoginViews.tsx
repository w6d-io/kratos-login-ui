'use client'

import { useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { env } from 'next-runtime-env'
import type { LoginFlow } from '@ory/client'
import { Field } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { OtpInput } from '@/components/ui/OtpInput'
import { Icons } from '@/components/ui/Icons'
import { ProviderLogo, providerLabel } from '@/components/ui/ProviderLogo'
import { WebAuthnTriggerForm } from '@/components/ui/OryWebAuthn'
import { useBranding } from '@/components/ui/Branding'
import { FlowCard } from '@/components/flow/FlowCard'
import { FlowMessages } from '@/components/flow/FlowMessages'
import { AccountChip, LastUsedBadge, MethodButton, MethodContent, ResendCode } from '@/components/flow/Parts'
import { LostDeviceHelp } from '@/components/flow/TwoFactor'
import { lastMethod, rememberMethod, type SignInMethod } from '@/components/flow/prefs'
import { fieldLabel } from '@/components/flow/labels'
import { getInput, getTriggerButton, hasGroup, type OidcProvider } from '@/lib/kratos-flow'
import type { FlowBanner } from '@/lib/flow-messages'

export type LoginStep = 'password' | 'totp' | 'webauthn' | 'lookup_secret' | 'code'
type Submit = (e: FormEvent) => void | Promise<void>

interface Base {
  flow: LoginFlow
  banners: FlowBanner[]
  networkError: string | null
  submitting: boolean
  setStep: (s: LoginStep) => void
}

/** The bot check on a first-factor form: the widget, and whether the submit waits for it. */
interface BotCheckSlot {
  botCheck?: ReactNode
  botCheckPending?: boolean
}

function BotCheckBlock({ slot, id }: { slot: BotCheckSlot; id: string }) {
  if (!slot.botCheck) return null
  return (
    <>
      <div className="mt-4">{slot.botCheck}</div>
      {slot.botCheckPending && <p id={id} className="small muted" style={{ margin: 'var(--space-2) 0 0' }}>Complete the bot check to continue.</p>}
    </>
  )
}

function withQuery(path: string, returnTo: string) {
  return `${path}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`
}

function Busy({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  return busy ? <><span className="spinner" aria-hidden /> {working}</> : <>{idle}</>
}

/** The method remembered in this browser, read after mount (localStorage is client-only). */
const noopSubscribe = () => () => {}
function useLastMethod(): SignInMethod | null {
  return useSyncExternalStore(noopSubscribe, lastMethod, () => null)
}

/** A second-factor security key is offered only when Kratos sent its trigger (the webauthn
    group also carries the helper script on every passkey flow). */
function offersSecurityKey(flow: LoginFlow): boolean {
  return !!getTriggerButton(flow, 'webauthn_login_trigger')
}

function switchAccountHref(returnTo: string) {
  const back = typeof window === 'undefined' ? '/login' : `${window.location.origin}${withQuery('/login', returnTo)}`
  return `/logout?return_to=${encodeURIComponent(back)}`
}

// ── First factor: SSO, passkey, email + password ──────────────────────────────────────────────

export function PasswordView(p: Base & BotCheckSlot & {
  /** False when sign-up is closed: no "Create an account" link to a page that would refuse. */
  signUpOpen?: boolean
  identifier: string
  setIdentifier: (v: string) => void
  password: string
  setPassword: (v: string) => void
  refreshing: boolean
  knownIdentifier: string
  oidc: OidcProvider[]
  methods: string[]
  returnTo: string
  onSubmitPassword: Submit
  onSubmitOidc: (provider: string) => void
}) {
  const { flow, refreshing } = p
  const { branding } = useBranding()
  const last = useLastMethod()
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  const idField = getInput(flow, 'identifier') || getInput(flow, 'password_identifier')
  const idError = idField?.errors?.[0]
  const pwError = getInput(flow, 'password')?.errors?.[0]
  const hasPassword = hasGroup(flow, 'password')
  const hasPasskey = hasGroup(flow, 'passkey')
  const offersCode = !refreshing && hasPassword && p.methods.includes('code')

  // SSO and passkey first when that is how this browser signed in last time.
  const quick = !refreshing && (p.oidc.length > 0 || hasPasskey)
  const quickFirst = quick && !!last && (last === 'passkey' || last.startsWith('oidc:'))

  const quickMethods = quick && (
    <div className="method-list">
      {hasPasskey && (
        <WebAuthnTriggerForm flow={flow} group="passkey" triggerName="passkey_login_trigger" className="method-btn" onTrigger={() => rememberMethod('passkey')}>
          <MethodContent
            icon={<Icons.Fingerprint size={18} />}
            title="Sign in with a passkey"
            hint="Face ID, Touch ID, Windows Hello or a security key"
            badge={last === 'passkey' ? <LastUsedBadge /> : undefined}
          />
        </WebAuthnTriggerForm>
      )}
      {p.oidc.map((o) => (
        <button
          key={o.provider}
          type="button"
          className="method-btn"
          disabled={!!p.botCheckPending}
          onClick={() => { rememberMethod(`oidc:${o.provider.toLowerCase()}`); p.onSubmitOidc(o.provider) }}
        >
          <MethodContent
            icon={<ProviderLogo name={o.provider} size={18} />}
            title={`Continue with ${providerLabel(o.provider)}`}
            badge={last === `oidc:${o.provider.toLowerCase()}` ? <LastUsedBadge /> : undefined}
          />
        </button>
      ))}
    </div>
  )

  const form = hasPassword && (
    <form
      onSubmit={(e) => { rememberMethod('password'); return p.onSubmitPassword(e) }}
      noValidate
      aria-label={refreshing ? 'Confirm your password' : 'Sign in with email and password'}
    >
      {refreshing ? (
        <AccountChip identifier={p.knownIdentifier} switchHref={switchAccountHref(p.returnTo)} />
      ) : (
        <Field label={fieldLabel(idField?.label, 'Email')} htmlFor="login-id" error={idError}>
          <input
            id="login-id"
            name={idField?.name || 'identifier'}
            type="email"
            inputMode="email"
            className="input"
            value={p.identifier}
            onChange={(e) => p.setIdentifier(e.target.value)}
            placeholder="you@company.com"
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={!quickFirst}
            required
          />
        </Field>
      )}
      {/* "Forgot password?" sits after the field, not in the label row, so Tab goes email →
          password → sign in without a detour. */}
      <Field
        label="Password"
        htmlFor="login-pw"
        error={pwError}
        after={refreshing ? undefined : <div className="field-after-link"><Link href={withQuery('/recovery', p.returnTo)}>Forgot password?</Link></div>}
      >
        <PasswordInput
          id="login-pw"
          name="password"
          value={p.password}
          onChange={p.setPassword}
          autoComplete="current-password"
          autoFocus={refreshing}
          required
        />
      </Field>
      <BotCheckBlock slot={p} id="login-bot-hint" />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || !!p.botCheckPending} aria-describedby={p.botCheckPending ? 'login-bot-hint' : undefined}>
          <Busy busy={p.submitting} idle={refreshing ? 'Confirm' : 'Sign in'} working={refreshing ? 'Confirming…' : 'Signing in…'} />
        </button>
      </div>
    </form>
  )

  const secondFactors = !refreshing && (offersSecurityKey(flow) || hasGroup(flow, 'totp'))

  const title = refreshing ? 'Confirm it’s you' : branding ? `Sign in to ${branding.displayName}` : 'Sign in'
  const subtitle = refreshing
    ? 'You’re about to change something sensitive. Enter your password to continue.'
    : branding
      ? `Use your ${appName} account.`
      : `Welcome back. Use your ${appName} account to continue.`

  return (
    <FlowCard
      title={title}
      subtitle={subtitle}
      footer={!refreshing && p.signUpOpen !== false && (
        <>New here? <Link href={withQuery('/register', p.returnTo)}>Create an account</Link></>
      )}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} />
      {quickFirst && quickMethods}
      {quickFirst && form && <div className="divider-text">or use your password</div>}
      {form}
      {!quickFirst && quick && <div className="divider-text">{form ? 'or' : 'Sign in with'}</div>}
      {!quickFirst && quickMethods}

      {(offersCode || secondFactors) && (
        <div className="secondary-actions">
          {offersCode && (
            <button type="button" className="btn-link" onClick={() => p.setStep('code')}>
              Email me a sign-in code instead{last === 'code' ? ' (last used)' : ''}
            </button>
          )}
          {offersSecurityKey(flow) && (
            <button type="button" className="btn-link" onClick={() => p.setStep('webauthn')}>Use a security key</button>
          )}
          {hasGroup(flow, 'totp') && (
            <button type="button" className="btn-link" onClick={() => p.setStep('totp')}>Use an authenticator app</button>
          )}
        </div>
      )}
    </FlowCard>
  )
}

// ── Passwordless: email a one-time code ─────────────────────────────────────────────────────────

export function CodeView(p: Base & BotCheckSlot & {
  identifier: string
  setIdentifier: (v: string) => void
  code: string
  setCode: (v: string) => void
  methods: string[]
  onSubmitCodeRequest: Submit
  onSubmitCodeVerify: Submit
  onResend: () => void | Promise<unknown>
  onChangeEmail: () => void
}) {
  const { flow } = p
  const idField = getInput(flow, 'identifier')
  const codeField = getInput(flow, 'code')
  const codeSent = !!codeField

  if (codeSent) {
    return (
      <FlowCard
        icon={<Icons.Inbox size={20} />}
        title="Check your email"
        subtitle={<>Enter the 6-digit code we sent to <strong>{p.identifier || 'your email'}</strong>.</>}
        footer={<button type="button" className="btn-link" onClick={p.onChangeEmail}>Use a different email</button>}
      >
        <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
        <form onSubmit={(e) => { if (p.botCheckPending) { e.preventDefault(); return } rememberMethod('code'); return p.onSubmitCodeVerify(e) }} noValidate>
          <Field label="Sign-in code" htmlFor="login-code" error={codeField?.errors?.[0]} hint="It can take a minute to arrive. Not there? Check spam or promotions.">
            {/* A full code auto-submits, bypassing the disabled button: not while the bot check waits. */}
            <OtpInput id="login-code" value={p.code} onChange={p.setCode} autoSubmit={!p.botCheckPending} />
          </Field>
          {/* The email code finishes the sign-in, so the hook checks the token on this submit. */}
          <BotCheckBlock slot={p} id="login-code-bot-hint" />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || p.code.length !== 6 || !!p.botCheckPending} aria-describedby={p.botCheckPending ? 'login-code-bot-hint' : undefined}>
              <Busy busy={p.submitting} idle="Sign in" working="Checking code…" />
            </button>
          </div>
        </form>
        <div className="mt-4">
          {/* A resend is another email: it waits for the bot check like the first one. */}
          {p.botCheckPending
            ? <p className="small muted" style={{ margin: 0 }}>Complete the bot check above to send another code.</p>
            : <ResendCode onResend={p.onResend} cooldownKey={`login-code:${flow.id}`} />}
        </div>
      </FlowCard>
    )
  }

  return (
    <FlowCard
      icon={<Icons.Mail size={20} />}
      title="Sign in with an email code"
      subtitle="No password needed — we’ll email you a 6-digit code."
      footer={<Link href={withQuery('/login', flow.return_to || '')} className="back"><Icons.ArrowLeft size={12} /> All sign-in options</Link>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} />
      <form onSubmit={(e) => { if (p.botCheckPending) { e.preventDefault(); return } return p.onSubmitCodeRequest(e) }} noValidate>
        <Field label={fieldLabel(idField?.label, 'Email')} htmlFor="login-id" error={idField?.errors?.[0]}>
          <input
            id="login-id"
            name={idField?.name || 'identifier'}
            type="email"
            inputMode="email"
            className="input"
            value={p.identifier}
            onChange={(e) => p.setIdentifier(e.target.value)}
            placeholder="you@company.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        </Field>
        {/* This submit sends the email, so the gateway checks the token here, before Kratos acts. */}
        <BotCheckBlock slot={p} id="login-code-request-bot-hint" />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || !p.identifier || !!p.botCheckPending} aria-describedby={p.botCheckPending ? 'login-code-request-bot-hint' : undefined}>
            <Busy busy={p.submitting} idle="Email me a code" working="Sending…" />
          </button>
        </div>
      </form>
      {p.methods.includes('password') && (
        <div className="secondary-actions">
          <button type="button" className="btn-link" onClick={() => p.setStep('password')}>Use my password instead</button>
        </div>
      )}
    </FlowCard>
  )
}

// ── Second factor ───────────────────────────────────────────────────────────────────────────────

function OtherFactors({ flow, methods, current, setStep }: { flow: LoginFlow; methods: string[]; current: LoginStep; setStep: (s: LoginStep) => void }) {
  const options = [
    current !== 'totp' && methods.includes('totp') && (
      <MethodButton key="totp" icon={<Icons.Smartphone size={18} />} title="Authenticator app" hint="A 6-digit code from 1Password, Authy, Google Authenticator…" onClick={() => setStep('totp')} />
    ),
    current !== 'webauthn' && offersSecurityKey(flow) && (
      <MethodButton key="webauthn" icon={<Icons.Key size={18} />} title="Security key or passkey" hint="Tap your key, or use Face ID / Touch ID" onClick={() => setStep('webauthn')} />
    ),
    current !== 'lookup_secret' && methods.includes('lookup_secret') && (
      <MethodButton key="lookup" icon={<Icons.ShieldCheck size={18} />} title="Backup code" hint="One of the codes you saved when you set this up" onClick={() => setStep('lookup_secret')} />
    ),
  ].filter(Boolean)
  if (!options.length) return null
  return (
    <>
      <div className="divider-text">Other ways to verify</div>
      <div className="method-list">{options}</div>
    </>
  )
}

export function TotpView(p: Base & { backToSignIn?: string; totp: string; setTotp: (v: string) => void; methods: string[]; returnTo: string; onSubmitTotp: Submit; helpUrl?: string | null }) {
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  return (
    <FlowCard
      icon={<Icons.Smartphone size={20} />}
      title="Two-step verification"
      subtitle={`Open your authenticator app and enter the current code for ${appName}.`}
      footer={<a href={p.backToSignIn ?? switchAccountHref(p.returnTo)}>Sign in with a different account</a>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
      <form onSubmit={p.onSubmitTotp} noValidate>
        <Field label="Authenticator code" htmlFor="totp" error={getInput(p.flow, 'totp_code')?.errors?.[0]} hint="Codes change every 30 seconds — use the one showing now.">
          <OtpInput id="totp" value={p.totp} onChange={p.setTotp} />
        </Field>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || p.totp.length < 6}>
            <Busy busy={p.submitting} idle="Verify" working="Verifying…" />
          </button>
        </div>
      </form>
      <OtherFactors flow={p.flow} methods={p.methods} current="totp" setStep={p.setStep} />
      <LostDeviceHelp onUseBackupCode={p.methods.includes('lookup_secret') ? () => p.setStep('lookup_secret') : undefined} helpUrl={p.helpUrl} />
    </FlowCard>
  )
}

export function LookupView(p: Base & { backToSignIn?: string; lookup: string; setLookup: (v: string) => void; methods: string[]; returnTo: string; onSubmitLookup: Submit; helpUrl?: string | null }) {
  return (
    <FlowCard
      icon={<Icons.ShieldCheck size={20} />}
      title="Use a backup code"
      subtitle="Enter one of the backup codes you saved when you turned on two-step verification. Each code works once."
      footer={<a href={p.backToSignIn ?? switchAccountHref(p.returnTo)}>Sign in with a different account</a>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
      <form onSubmit={p.onSubmitLookup} noValidate>
        <Field label="Backup code" htmlFor="lookup" error={getInput(p.flow, 'lookup_secret')?.errors?.[0]} hint="After signing in, generate a new set in Settings → Two-factor if you’re running low.">
          <input
            id="lookup"
            className="input code"
            value={p.lookup}
            onChange={(e) => p.setLookup(e.target.value.trim())}
            placeholder="xxxxxxxx"
            autoFocus
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || !p.lookup}>
            <Busy busy={p.submitting} idle="Verify" working="Verifying…" />
          </button>
        </div>
      </form>
      <OtherFactors flow={p.flow} methods={p.methods} current="lookup_secret" setStep={p.setStep} />
      <LostDeviceHelp helpUrl={p.helpUrl} />
    </FlowCard>
  )
}

export function WebAuthnView(p: Base & { backToSignIn?: string; methods: string[]; returnTo: string; helpUrl?: string | null }) {
  const { flow } = p
  const second = offersSecurityKey(flow)
  return (
    <FlowCard
      icon={<Icons.Key size={20} />}
      title={second ? 'Use your security key' : 'Sign in with a passkey'}
      subtitle={second
        ? 'Insert or tap your security key, or confirm with the device that holds your passkey.'
        : 'Confirm with Face ID, Touch ID, Windows Hello or your security key.'}
      footer={<a href={p.backToSignIn ?? switchAccountHref(p.returnTo)}>Sign in with a different account</a>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
      {(second || hasGroup(flow, 'passkey')) && (
        <WebAuthnTriggerForm
          flow={flow}
          group={second ? 'webauthn' : 'passkey'}
          triggerName={second ? 'webauthn_login_trigger' : 'passkey_login_trigger'}
          className="btn btn-primary btn-block"
        >
          <Icons.Fingerprint size={16} /> {second ? 'Use security key' : 'Use passkey'}
        </WebAuthnTriggerForm>
      )}
      <p className="small muted mt-3 text-center">Your browser will open a prompt. Nothing leaves your device except a signed proof.</p>
      <OtherFactors flow={flow} methods={p.methods} current="webauthn" setStep={p.setStep} />
      {second && <LostDeviceHelp onUseBackupCode={p.methods.includes('lookup_secret') ? () => p.setStep('lookup_secret') : undefined} helpUrl={p.helpUrl} />}
    </FlowCard>
  )
}
