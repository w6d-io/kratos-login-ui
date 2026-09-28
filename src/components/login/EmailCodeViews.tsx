'use client'

import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { env } from 'next-runtime-env'
import type { RecoveryFlow, VerificationFlow } from '@ory/client'
import { Field } from '@/components/ui/Field'
import { OtpInput } from '@/components/ui/OtpInput'
import { Icons } from '@/components/ui/Icons'
import { FlowCard } from '@/components/flow/FlowCard'
import { FlowMessages } from '@/components/flow/FlowMessages'
import { ResendCode } from '@/components/flow/Parts'
import { getInput, hasGroup } from '@/lib/kratos-flow'
import type { FlowBanner } from '@/lib/flow-messages'

type Submit = (e: FormEvent) => void | Promise<void>

interface Shared {
  banners: FlowBanner[]
  networkError: string | null
  submitting: boolean
  email: string
  setEmail: (v: string) => void
  onSubmitRequest: Submit
  /** Bot check before an email goes out (request and resend); null when this flow asks for none. */
  botCheck?: ReactNode
  botCheckPending?: boolean
}

/** Back to sign-in, keeping the flow's destination (a bare /login would start a flow without it). */
function BackToSignIn({ returnTo }: { returnTo?: string }) {
  const href = returnTo ? `/login?return_to=${encodeURIComponent(returnTo)}` : '/login'
  return <Link href={href} className="back"><Icons.ArrowLeft size={12} /> Back to sign in</Link>
}

function Busy({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  return busy ? <><span className="spinner" aria-hidden /> {working}</> : <>{idle}</>
}

function EmailRequest({ p, flow, icon, title, subtitle, cta, idPrefix }: {
  p: Shared
  flow: RecoveryFlow | VerificationFlow
  icon: ReactNode
  title: string
  subtitle: ReactNode
  cta: string
  idPrefix: string
}) {
  return (
    <FlowCard icon={icon} title={title} subtitle={subtitle} footer={<BackToSignIn returnTo={flow.return_to} />}>
      <FlowMessages banners={p.banners} networkError={p.networkError} />
      <form onSubmit={p.onSubmitRequest} noValidate>
        <Field label="Email" htmlFor={`${idPrefix}-email`} error={getInput(flow, 'email')?.errors?.[0]}>
          <input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="input"
            value={p.email}
            onChange={(e) => p.setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            required
          />
        </Field>
        {p.botCheck && <div className="mt-4">{p.botCheck}</div>}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || !p.email || !!p.botCheckPending}>
            <Busy busy={p.submitting} idle={cta} working="Sending…" />
          </button>
        </div>
      </form>
    </FlowCard>
  )
}

/** Six boxes, the hint about spam, the one button. */
function CodeForm({ p, flow, cta, idPrefix, code, setCode, onSubmitCode }: {
  p: Shared
  flow: RecoveryFlow | VerificationFlow
  cta: string
  idPrefix: string
  code: string
  setCode: (v: string) => void
  onSubmitCode: Submit
}) {
  return (
    // The gateway checks the code submit too (with the token the email was sent with): wait for it.
    <form onSubmit={(e) => { if (p.botCheckPending) { e.preventDefault(); return } return onSubmitCode(e) }} noValidate>
      <Field
        label="6-digit code"
        htmlFor={`${idPrefix}-code`}
        error={getInput(flow, 'code')?.errors?.[0]}
        hint="It can take a minute to arrive. Not there? Check spam or promotions."
      >
        {/* A full code submits by itself, bypassing the disabled button: not while the check waits. */}
        <OtpInput id={`${idPrefix}-code`} value={code} onChange={setCode} autoSubmit={!p.botCheckPending} />
      </Field>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary btn-block" disabled={p.submitting || code.length !== 6 || !!p.botCheckPending}>
          <Busy busy={p.submitting} idle={cta} working="Checking code…" />
        </button>
      </div>
    </form>
  )
}

function Sent({ p, flow, idPrefix, subtitle, cta, code, setCode, onSubmitCode, onChangeEmail, onResend, linkSteps }: {
  p: Shared
  flow: RecoveryFlow | VerificationFlow
  idPrefix: string
  subtitle: ReactNode
  cta: string
  code: string
  setCode: (v: string) => void
  onSubmitCode: Submit
  onChangeEmail: () => void
  onResend: () => void | Promise<unknown>
  /** Link method: no code to type — say what to do in the email instead. */
  linkSteps?: ReactNode[]
}) {
  return (
    <FlowCard
      icon={<Icons.Inbox size={20} />}
      title="Check your inbox"
      subtitle={subtitle}
      footer={<button type="button" className="btn-link" onClick={onChangeEmail}>Use a different email</button>}
    >
      <FlowMessages banners={p.banners} networkError={p.networkError} quiet />
      {linkSteps ? (
        <>
          <ol className="steps">{linkSteps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
          <p className="small muted mt-4">Not there after a minute? Check spam or promotions. The link works once and expires soon.</p>
        </>
      ) : (
        <CodeForm p={p} flow={flow} cta={cta} idPrefix={idPrefix} code={code} setCode={setCode} onSubmitCode={onSubmitCode} />
      )}
      {/* Every email sent is checked, a resend included. */}
      {p.botCheck && <div className="mt-4">{p.botCheck}</div>}
      <div className="mt-4">
        {p.botCheckPending
          ? <p className="small muted" style={{ margin: 0 }}>Complete the bot check above to send another {linkSteps ? 'email' : 'code'}.</p>
          : <ResendCode onResend={onResend} cooldownKey={`${idPrefix}:${flow.id}`} label={linkSteps ? 'Resend email' : 'Resend code'} />}
      </div>
    </FlowCard>
  )
}

// ── Recovery ────────────────────────────────────────────────────────────────────────────────────

export function RecoveryView(p: Shared & {
  flow: RecoveryFlow
  stage: 'request' | 'verify'
  code: string
  setCode: (v: string) => void
  onSubmitCode: Submit
  onChangeEmail: () => void
  onResend: () => void | Promise<unknown>
}) {
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  if (p.stage === 'verify') {
    const usesCode = hasGroup(p.flow, 'code')
    const to = <strong>{p.email || 'your email'}</strong>
    return (
      <Sent
        p={p}
        flow={p.flow}
        idPrefix="rec"
        subtitle={usesCode
          ? <>If {to} has an account, we sent it a 6-digit code. Enter it and you’ll choose a new password next.</>
          : <>If {to} has an account, we sent it a link to get back in.</>}
        cta="Continue"
        code={p.code}
        setCode={p.setCode}
        onSubmitCode={p.onSubmitCode}
        onChangeEmail={p.onChangeEmail}
        onResend={p.onResend}
        linkSteps={usesCode ? undefined : [
          <>Open the email from <strong>{appName}</strong>.</>,
          <>Select the link inside — it brings you back here, signed in.</>,
          <>Choose a new password in the page that opens.</>,
        ]}
      />
    )
  }
  return (
    <EmailRequest
      p={p}
      flow={p.flow}
      idPrefix="rec"
      icon={<Icons.Key size={20} />}
      title="Reset your password"
      subtitle={hasGroup(p.flow, 'code')
        ? 'Enter the email you sign in with. We’ll send a code to confirm it’s you, then you’ll pick a new password.'
        : 'Enter the email you sign in with. We’ll send a link that signs you in so you can pick a new password.'}
      cta={hasGroup(p.flow, 'code') ? 'Send code' : 'Send recovery link'}
    />
  )
}

// ── Verification ────────────────────────────────────────────────────────────────────────────────

export function VerificationView(p: Shared & {
  flow: VerificationFlow
  /** Where "Continue" goes after success; defaults to the flow's return_to, else /login. */
  continueUrl?: string
  stage: 'request' | 'verify' | 'success'
  code: string
  setCode: (v: string) => void
  onSubmitCode: Submit
  onChangeEmail: () => void
  onResend: () => void | Promise<unknown>
}) {
  if (p.stage === 'success') {
    const next = p.continueUrl ?? ((p.flow as { return_to?: string }).return_to || '/login')
    return (
      <FlowCard
        icon={<Icons.CheckCircle size={20} />}
        tone="success"
        title="Email verified"
        subtitle={<>Thanks — {p.email ? <strong>{p.email}</strong> : 'your email'} is confirmed. You can carry on where you left off.</>}
      >
        <a href={next} className="btn btn-primary btn-block">Continue</a>
      </FlowCard>
    )
  }
  if (p.stage === 'verify') {
    return (
      <Sent
        p={p}
        flow={p.flow}
        idPrefix="ver"
        subtitle={<>We sent a 6-digit code to <strong>{p.email || 'your email'}</strong>. Enter it to confirm the address is yours.</>}
        cta="Verify email"
        code={p.code}
        setCode={p.setCode}
        onSubmitCode={p.onSubmitCode}
        onChangeEmail={p.onChangeEmail}
        onResend={p.onResend}
        linkSteps={hasGroup(p.flow, 'code') ? undefined : [
          <>Open the email we just sent.</>,
          <>Select the verification link inside.</>,
          <>Come back here — you’re done.</>,
        ]}
      />
    )
  }
  return (
    <EmailRequest
      p={p}
      flow={p.flow}
      idPrefix="ver"
      icon={<Icons.Mail size={20} />}
      title="Verify your email"
      subtitle="We’ll send a 6-digit code to confirm this address belongs to you."
      cta="Send code"
    />
  )
}
