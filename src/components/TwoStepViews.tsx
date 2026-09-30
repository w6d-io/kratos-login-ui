'use client'

import type { ReactNode } from 'react'
import { Banner } from '@/components/ui/Banner'
import { Icons } from '@/components/ui/Icons'
import { FlowCard } from '@/components/flow/FlowCard'
import { AccountChip } from '@/components/flow/Parts'

interface TwoStepSetupViewProps {
  email: string | null
  /** Where the person is headed (a site's name, or null for "your account"). */
  destinationName: string | null
  error?: string | null
  /** The enrolment rows (authenticator app, security key), from the settings components. */
  children: ReactNode
  signOutHref: string
  /** An app is signing in to the account (MCP): the reason is the app, not an administrator role. */
  forApp?: boolean
}

/**
 * "Set up two-step sign-in to continue": the only step between the first
 * factor and the destination for an account that must have a second factor
 * and has none. There is no skip — the way out is signing out.
 */
export function TwoStepSetupView({ email, destinationName, error, children, signOutHref, forApp }: TwoStepSetupViewProps) {
  return (
    <FlowCard
      icon={<Icons.Shield size={20} />}
      title={forApp ? 'Set up two-step sign-in to connect the app' : 'Set up two-step sign-in to continue'}
      subtitle={forApp ? (
        <>
          Before an app can act as you, your account needs a second step after your password.
          It takes about two minutes, once — then you’ll go on to choose what the app may do.
        </>
      ) : (
        <>
          Your account has administrator access, so it has to be protected by a second step after your password.
          It takes about two minutes, once — then you’ll go on to {destinationName ?? 'where you were headed'}.
        </>
      )}
      footer={
        <a href={signOutHref} className="btn btn-ghost btn-block">
          <Icons.LogOut size={16} /> Sign out instead
        </a>
      }
    >
      {email && <AccountChip identifier={email} />}
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="two-step-methods">{children}</div>
    </FlowCard>
  )
}

/** Stepped up and still not at the second level: stop bouncing between pages, offer a retry. */
export function TwoStepStuckView({ onRetry, signOutHref }: { onRetry: () => void; signOutHref: string }) {
  return (
    <FlowCard
      icon={<Icons.Shield size={20} />}
      tone="warn"
      title="We couldn’t confirm your second step"
      subtitle="Your account needs two-step sign-in, and the confirmation didn’t stick. Try again, or sign out and sign in again."
    >
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
          <Icons.RefreshCcw size={16} /> Try again
        </button>
        <a href={signOutHref} className="btn btn-secondary btn-block">
          <Icons.LogOut size={16} /> Sign out
        </a>
      </div>
    </FlowCard>
  )
}

/**
 * The sign-in site couldn't ask whether this account needs a second factor, and the destination
 * already sent the person back once: continuing again would loop. Retry, add a factor anyway, or leave.
 */
export function TwoStepUncheckedView({ onRetry, settingsHref, signOutHref }: { onRetry: () => void; settingsHref: string; signOutHref: string }) {
  return (
    <FlowCard
      icon={<Icons.Shield size={20} />}
      tone="warn"
      title="We couldn’t check your sign-in security"
      subtitle="The service that says whether your account needs two-step sign-in didn’t answer, and the page you’re going to sent you back. If your role requires a second factor, setting one up now gets you through."
    >
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}>
          <Icons.RefreshCcw size={16} /> Try again
        </button>
        <a href={settingsHref} className="btn btn-secondary btn-block">
          <Icons.Shield size={16} /> Add a second factor
        </a>
        <a href={signOutHref} className="btn btn-ghost btn-block">
          <Icons.LogOut size={16} /> Sign out
        </a>
      </div>
    </FlowCard>
  )
}
