'use client'

import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { FlowCard } from '@/components/flow/FlowCard'
import { AccountChip } from '@/components/flow/Parts'
import { switchAccountUrl, type ENROL_GROUPS } from '@/lib/access'

type EnrolMethod = (typeof ENROL_GROUPS)[number]

const METHOD_LABELS: Record<EnrolMethod, { title: string; hint: string; icon: keyof typeof Icons }> = {
  totp: { title: 'Authenticator app', hint: 'A 6-digit code from an app such as 1Password or Google Authenticator', icon: 'Smartphone' },
  webauthn: { title: 'Security key', hint: 'A hardware key or your device’s built-in authenticator', icon: 'Key' },
  lookup_secret: { title: 'Recovery codes', hint: 'Single-use codes you keep somewhere safe', icon: 'ShieldCheck' },
}

interface ForbiddenViewProps {
  siteName: string
  email: string | null
  helpUrl: string | null
  returnTo: string | null
  origin: string
  /** The session is already aal2, so the refusal is a permission problem. */
  alreadyAal2: boolean
}

export function ForbiddenView({ siteName, email, helpUrl, returnTo, origin, alreadyAal2 }: ForbiddenViewProps) {
  return (
    <FlowCard
      icon={<Icons.Lock size={20} />}
      tone="warn"
      title={`You don't have access to ${siteName}`}
      subtitle="You’re signed in, but this account hasn’t been given access to this site."
    >
      {email && <AccountChip identifier={email} />}
      {alreadyAal2 && (
        <Banner tone="info">You already confirmed with a second factor, so this isn&apos;t about two-factor sign-in.</Banner>
      )}
      <p className="muted" style={{ margin: '0 0 var(--space-4)' }}>
        {helpUrl ? (
          <><a href={helpUrl} target="_blank" rel="noopener noreferrer">Ask for access</a> — the site&apos;s team can add you. Or switch to an account that already has access.</>
        ) : (
          <>Ask the site&apos;s administrator to give your account access, or switch to an account that has it.</>
        )}
      </p>
      <div className="form-actions" style={{ marginTop: 0 }}>
        {returnTo && (
          <a href={returnTo} className="btn btn-primary btn-block">
            <Icons.RefreshCcw size={16} /> Try again
          </a>
        )}
        <a href={switchAccountUrl(origin, returnTo)} className={`btn ${returnTo ? 'btn-secondary' : 'btn-primary'} btn-block`}>
          <Icons.User size={16} /> Switch account
        </a>
      </div>
    </FlowCard>
  )
}

interface EnrolViewProps {
  siteName: string
  email: string | null
  /** null = unknown (settings probe failed); [] = no second factor enabled on the platform. */
  methods: EnrolMethod[] | null
  settingsUrl: string
  helpUrl: string | null
}

export function EnrolView({ siteName, email, methods, settingsUrl, helpUrl }: EnrolViewProps) {
  const none = methods !== null && methods.length === 0
  return (
    <FlowCard
      icon={<Icons.Shield size={20} />}
      title={`Set up two-factor sign-in to use ${siteName}`}
      subtitle={`${siteName} asks for a second step after your password. It takes about two minutes, once — then you’ll land back where you were.`}
    >
      {email && <AccountChip identifier={email} />}
      {none ? (
        <Banner tone="warn" title="Two-factor sign-in isn't available yet">
          No second factor is turned on for this platform. {helpUrl ? (
            <a href={helpUrl} target="_blank" rel="noopener noreferrer">Contact the site&apos;s team</a>
          ) : 'Contact an administrator'}.
        </Banner>
      ) : (
        <>
          {methods && methods.length > 0 && (
            <>
              <p className="small muted" style={{ margin: '0 0 var(--space-2)' }}>You can choose from:</p>
              <ul className="method-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-5)' }}>
                {methods.map((m) => {
                  const I = Icons[METHOD_LABELS[m].icon]
                  return (
                    <li key={m} className="method-btn" style={{ cursor: 'default' }}>
                      <span className="method-btn-icon"><I size={18} /></span>
                      <span className="method-btn-text">
                        <span>{METHOD_LABELS[m].title}</span>
                        <span className="method-btn-hint">{METHOD_LABELS[m].hint}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <a href={settingsUrl} className="btn btn-primary btn-block">
            <Icons.Shield size={16} /> Set up two-factor sign-in
          </a>
        </>
      )}
    </FlowCard>
  )
}

/** `unavailable`: jinbe couldn't say why access was refused — neutral, no guessing. */
export function AccessErrorView({ onRetry, unavailable }: { onRetry: () => void; unavailable?: boolean }) {
  return (
    <FlowCard
      icon={<Icons.Plug size={20} />}
      title={unavailable ? 'We can’t check your access right now' : 'We couldn’t check your access'}
      subtitle={unavailable
        ? 'Something on our side didn’t answer in time. Nothing is wrong with your account — try again in a moment.'
        : 'The sign-in service didn’t answer. Check your connection and try again.'}
    >
      <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
        <Icons.RefreshCcw size={16} /> Try again
      </button>
    </FlowCard>
  )
}
