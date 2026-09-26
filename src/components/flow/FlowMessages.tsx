import { Banner } from '@/components/ui/Banner'
import type { FlowBanner } from '@/lib/flow-messages'

/**
 * A step's messages: our own network error first, then whatever Kratos said about the flow.
 * `quiet` drops Kratos' informational notices on screens whose own title and subtitle already
 * say the same thing ("An email containing a code has been sent…" under "Check your inbox").
 * Errors, warnings and successes always show. Kratos' generic "Notice" title adds nothing and is dropped.
 */
export function FlowMessages({ banners, networkError, quiet }: { banners: FlowBanner[]; networkError?: string | null; quiet?: boolean }) {
  return (
    <>
      {networkError && (
        <Banner tone="danger">{networkError}</Banner>
      )}
      {banners.filter((b) => !(quiet && b.tone === 'info')).map((b, i) => (
        <Banner key={`${b.title}-${i}`} tone={b.tone} title={b.title === 'Notice' ? undefined : b.title}>{b.body}</Banner>
      ))}
    </>
  )
}
