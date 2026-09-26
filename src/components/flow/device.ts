/**
 * Turns a session's user-agent string into something a person recognises ("Chrome on macOS")
 * and a timestamp into "5 minutes ago". Best effort: anything unrecognised says so plainly.
 */

export type DeviceKind = 'desktop' | 'phone' | 'tablet'

export interface DeviceInfo {
  label: string
  kind: DeviceKind
}

function browserOf(ua: string): string | null {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
  if (/Chrome\/|CriOS/.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari'
  if (/curl\//i.test(ua)) return 'curl'
  return null
}

function osOf(ua: string): string | null {
  if (/iPad/.test(ua)) return 'iPadOS'
  if (/iPhone|iPod/.test(ua)) return 'iOS'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}

export function describeDevice(ua: string | null | undefined): DeviceInfo {
  const s = ua ?? ''
  const browser = browserOf(s)
  const os = osOf(s)
  const kind: DeviceKind = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? 'tablet' : /Mobi|iPhone|Android/.test(s) ? 'phone' : 'desktop'
  const label = browser && os ? `${browser} on ${os}` : browser || os || 'Unknown device'
  return { label, kind }
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function relativeTime(iso: string | Date | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'unknown'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'unknown'
  const diff = Math.round((t - now) / 1000)
  if (Math.abs(diff) < 60) return 'just now'
  const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return fmt.format(Math.round(diff / secs), unit)
  }
  return 'just now'
}
