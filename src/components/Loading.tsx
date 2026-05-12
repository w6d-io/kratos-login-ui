export function Loading() {
  return (
    <div className="card" style={{ width: '100%', maxWidth: 'var(--content-w)' }}>
      <div className="card-pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220 }}>
        <span className="row" style={{ color: 'var(--fg-tertiary)' }}>
          <span className="spinner" />
          <span>Loading…</span>
        </span>
      </div>
    </div>
  )
}
