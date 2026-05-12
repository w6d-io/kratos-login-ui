interface ProviderLogoProps {
  name: string
  size?: number
}

function family(name: string): string {
  const lower = name.toLowerCase()
  if (lower.startsWith('google')) return 'google'
  if (lower.startsWith('microsoft') || lower.startsWith('azure')) return 'microsoft'
  if (lower.startsWith('github')) return 'github'
  if (lower.startsWith('gitlab')) return 'gitlab'
  if (lower.startsWith('apple')) return 'apple'
  if (lower.startsWith('facebook')) return 'facebook'
  if (lower.startsWith('saml') || lower.startsWith('sso') || lower.startsWith('oidc')) return 'sso'
  return lower
}

export function ProviderLogo({ name, size = 18 }: ProviderLogoProps) {
  const s = size
  switch (family(name)) {
    case 'google':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h6c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.8 3.2-8.1z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H1.9v2.9C3.7 20.5 7.6 23 12 23z" />
          <path fill="#FBBC04" d="M5.7 14c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V6.9H1.9c-.7 1.5-1.2 3.2-1.2 5s.4 3.5 1.2 5l3.8-2.9z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.1C17.5 2.1 15 1 12 1 7.6 1 3.7 3.5 1.9 7l3.8 2.9C6.6 7.4 9.1 5.4 12 5.4z" />
        </svg>
      )
    case 'microsoft':
      return (
        <svg width={s} height={s} viewBox="0 0 23 23">
          <rect x="1" y="1" width="10" height="10" fill="#F25022" />
          <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
          <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
          <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
        </svg>
      )
    case 'gitlab':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path fill="#FC6D26" d="M23.6 9.6L20.5 0l-2.4 7.4H6L3.5 0 .4 9.6c-.3.8 0 1.7.7 2.2L12 20l10.9-8.2c.7-.5 1-1.4.7-2.2z" />
          <path fill="#E24329" d="M12 20l4.1-12.6H7.9z" />
          <path fill="#FCA326" d="M12 20l-4.1-12.6H2.2L12 20z M12 20l4.1-12.6h5.7L12 20z" />
        </svg>
      )
    case 'github':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z" />
        </svg>
      )
    case 'apple':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 12.04c-.03-2.96 2.42-4.38 2.53-4.45-1.38-2.02-3.53-2.3-4.3-2.33-1.83-.19-3.57 1.08-4.5 1.08-.94 0-2.37-1.05-3.89-1.02-2 .03-3.85 1.17-4.88 2.95-2.08 3.61-.53 8.96 1.5 11.89.99 1.43 2.18 3.04 3.7 2.98 1.48-.06 2.04-.96 3.83-.96 1.79 0 2.29.96 3.86.93 1.59-.03 2.6-1.45 3.58-2.89.71-1.02 1.27-2.06 1.66-3.17-.04-.02-3.05-1.17-3.09-4.01zM14.36 3.5c.81-.99 1.36-2.36 1.2-3.73-1.16.05-2.57.78-3.41 1.76-.75.87-1.41 2.27-1.23 3.6 1.3.1 2.62-.66 3.44-1.63z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="#1877F2">
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
        </svg>
      )
    case 'sso':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V5l8-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      )
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9 9a3 3 0 1 1 6 0c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
  }
}

const LABELS: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  gitlab: 'GitLab',
  github: 'GitHub',
  apple: 'Apple',
  facebook: 'Facebook',
  sso: 'SSO',
}

export function providerLabel(p: string): string {
  const fam = family(p)
  return LABELS[fam] || p.charAt(0).toUpperCase() + p.slice(1)
}
