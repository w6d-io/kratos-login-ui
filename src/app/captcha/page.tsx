'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlowCard } from '@/components/flow/FlowCard'
import { Icons } from '@/components/ui/Icons'
import { Loading } from '@/components/Loading'
import { BotCheckWidget, useSignInProtection } from '@/components/ui/BotCheck'
import { botCheckFor } from '@/lib/sign-in-protection'
import { captchaAction, deliverCaptcha } from '@/lib/captcha-bridge'

/** The bot check alone, for apps: see src/lib/captcha-bridge.ts. */
function CaptchaPageContent() {
  const action = captchaAction(useSearchParams().get('action'))
  const protection = useSignInProtection()
  const [sent, setSent] = useState(false)
  const check = protection && action ? botCheckFor(protection, action) : null
  // This flow asks for no check: tell the app once, so it submits without a token.
  const noCheck = !!protection && !!action && !check
  useEffect(() => {
    if (noCheck && action) deliverCaptcha({ type: 'captcha-token', action, token: null }, window as never)
  }, [noCheck, action])

  // BotCheckWidget keeps the latest callback in a ref: a plain function is enough.
  const onToken = (token: string | null) => {
    if (!token || !action) return
    deliverCaptcha({ type: 'captcha-token', action, token }, window as never)
    setSent(true)
  }

  if (!action) {
    return (
      <FlowCard icon={<Icons.Shield size={20} />} tone="warn" title="Unknown bot check"
        subtitle="Open this page with ?action=login, registration, recovery or verification: the flow the token is for." />
    )
  }
  if (!protection) return <Loading />
  if (!check) {
    return <FlowCard icon={<Icons.Shield size={20} />} title="No bot check needed" subtitle="This flow asks for no bot check right now: submit without a token." />
  }
  return (
    <FlowCard icon={<Icons.Shield size={20} />} title={sent ? 'Done' : 'Quick check'}
      subtitle={sent ? 'You can go back to the app.' : 'Confirm you’re human to continue in the app.'}>
      <BotCheckWidget check={check} action={action} onToken={onToken} />
    </FlowCard>
  )
}

export default function CaptchaPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CaptchaPageContent />
    </Suspense>
  )
}
