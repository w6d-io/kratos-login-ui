import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { switchAccountUrl, type ENROL_GROUPS } from '@/lib/access'

type EnrolMethod = (typeof ENROL_GROUPS)[number]

const METHOD_LABELS: Record<EnrolMethod, { title: string; hint: string }> = {
  totp: { title: 'Authenticator app', hint: 'A 6-digit code from an app such as 1Password or Google Authenticator' },
  webauthn: { title: 'Security key', hint: 'A hardware key or your device’s built-in authenticator' },
  lookup_secret: { title: 'Recovery codes', hint: 'Single-use codes you keep somewhere safe' },
}

function SignedInAs({ email }: { email: string | null }) {
  if (!email) return null
  return (
    <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
      Signed in as <strong>{email}</strong>
    </p>
  )
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
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>You don&apos;t have access to {siteName}</h1>
        <p>Your account is signed in, but it hasn&apos;t been given access to this site.</p>
      </div>
      <div className="card-body">
        <SignedInAs email={email} />
        {alreadyAal2 && (
          <Banner tone="info">You already confirmed with a second factor, so this isn&apos;t about two-factor sign-in.</Banner>
        )}
        {helpUrl ? (
          <p style={{ fontSize: 13.5 }}>
            <a href={helpUrl} target="_blank" rel="noopener noreferrer">Ask for access</a> — the site&apos;s team can add you.
          </p>
        ) : (
          <p style={{ fontSize: 13.5 }}>Ask the site&apos;s administrator to give your account access.</p>
        )}
        <div className="btn-row mt-4">
          <a href={switchAccountUrl(origin, returnTo)} className="btn btn-secondary btn-block">
            <Icons.User size={16} /> Switch account
          </a>
          {returnTo && (
            <a href={returnTo} className="btn btn-primary btn-block">
              Try again
            </a>
          )}
        </div>
      </div>
    </div>
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
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>Set up two-factor sign-in to use {siteName}</h1>
        <p>{siteName} needs a second step after your password. Set one up once, then you&apos;ll land back where you were.</p>
      </div>
      <div className="card-body">
        <SignedInAs email={email} />
        {none ? (
          <Banner tone="warn" title="Two-factor sign-in isn't available yet">
            No second factor is turned on for this platform. {helpUrl ? (
              <a href={helpUrl} target="_blank" rel="noopener noreferrer">Contact the site&apos;s team</a>
            ) : 'Contact an administrator'}.
          </Banner>
        ) : (
          <>
            {methods && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 10 }}>
                {methods.map((m) => (
                  <li key={m} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Icons.ShieldCheck size={16} />
                    <span>
                      <strong style={{ display: 'block', fontSize: 13.5 }}>{METHOD_LABELS[m].title}</strong>
                      <span className="muted" style={{ fontSize: 12.5 }}>{METHOD_LABELS[m].hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <a href={settingsUrl} className="btn btn-primary btn-block">
              <Icons.Shield size={16} /> Set up two-factor sign-in
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export function AccessErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-head">
        <h1>We couldn&apos;t check your access</h1>
        <p>The sign-in service didn&apos;t answer. Check your connection and try again.</p>
      </div>
      <div className="card-body">
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
          <Icons.RefreshCcw size={16} /> Try again
        </button>
      </div>
    </div>
  )
}
