import type { ReactNode } from 'react'
import type { OryFlowComponentOverrides } from '@ory/elements-react'

/**
 * Override Ory Elements' default chrome so it renders ONLY the form inside
 * our own `.card` shell. We supply card body, header, footer; Ory just
 * renders inputs + buttons + messages.
 *
 * IMPORTANT: keep an `.ory-elements` class on the wrapper — all of Ory's
 * theme CSS (input borders, button styles, divider, etc.) is scoped under
 * `.ory-elements *` so removing that class loses every Ory style.
 */

function BareRoot({ children }: { children?: ReactNode }) {
  // No card chrome (our outer .card already has border + shadow + radius),
  // but the .ory-elements class is required for Ory's CSS to apply.
  return <div className="ory-elements ory-bare-root">{children}</div>
}

function NullComponent() {
  return null
}

export const cardChromeOverrides: OryFlowComponentOverrides = {
  Card: {
    Root: BareRoot as never,
    Logo: NullComponent as never,
    Header: NullComponent as never,
    Footer: NullComponent as never,
  },
}
