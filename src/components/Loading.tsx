/**
 * The placeholder while a flow loads: the same card box, head and field rhythm as the screen that
 * replaces it, so nothing jumps when it arrives. Announced once to screen readers.
 */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="card card-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <div className="card-head" aria-hidden>
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
      <div className="card-body" aria-hidden>
        <span className="skeleton label" />
        <span className="skeleton" />
        <span className="skeleton label" />
        <span className="skeleton" />
        <span className="skeleton" style={{ marginTop: 'var(--space-5)' }} />
      </div>
    </div>
  )
}
