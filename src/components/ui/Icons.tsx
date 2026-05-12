import type { ReactNode, SVGAttributes } from 'react'

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'd' | 'stroke' | 'fill'> {
  d?: string | ReactNode
  size?: number
  stroke?: number
  fill?: string
}

export function Icon({ d, size = 16, stroke = 2, fill, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill || 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {typeof d === 'string' ? <path d={d} /> : d}
    </svg>
  )
}

type IconRenderer = (p?: Omit<IconProps, 'd'>) => JSX.Element

export const Icons: Record<string, IconRenderer> = {
  Eye: (p) => <Icon {...p} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  EyeOff: (p) => <Icon {...p} d={<><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M7.4 7.4C4.4 9 2 12 2 12s3.5 7 10 7c2 0 3.7-.6 5.2-1.5"/><path d="M14.7 6.6A11 11 0 0 0 12 5C5.5 5 2 12 2 12"/></>} />,
  Mail: (p) => <Icon {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>} />,
  Lock: (p) => <Icon {...p} d={<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>} />,
  Key: (p) => <Icon {...p} d={<><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/></>} />,
  Shield: (p) => <Icon {...p} d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />,
  ShieldCheck: (p) => <Icon {...p} d={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></>} />,
  User: (p) => <Icon {...p} d={<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></>} />,
  Users: (p) => <Icon {...p} d={<><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3 3-5 7-5s7 2 7 5"/><path d="M17 9a3 3 0 0 0 0-6"/><path d="M22 20c0-2.5-2-4.5-5-5"/></>} />,
  AlertCircle: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><circle cx="12" cy="16" r=".5" fill="currentColor" stroke="none"/></>} />,
  AlertTriangle: (p) => <Icon {...p} d={<><path d="M12 3l10 17H2L12 3z"/><path d="M12 10v4"/><circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none"/></>} />,
  CheckCircle: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></>} />,
  Check: (p) => <Icon {...p} d="M5 12l5 5 9-11" />,
  X: (p) => <Icon {...p} d="M6 6l12 12 M18 6L6 18" />,
  Info: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".5" fill="currentColor" stroke="none"/></>} />,
  Clock: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  ArrowLeft: (p) => <Icon {...p} d="M15 18l-6-6 6-6" />,
  ArrowRight: (p) => <Icon {...p} d="M9 18l6-6-6-6" />,
  ChevronDown: (p) => <Icon {...p} d="M6 9l6 6 6-6" />,
  ChevronRight: (p) => <Icon {...p} d="M9 6l6 6-6 6" />,
  Globe: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></>} />,
  Sun: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4"/></>} />,
  Moon: (p) => <Icon {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  Monitor: (p) => <Icon {...p} d={<><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8 M12 17v4"/></>} />,
  Laptop: (p) => <Icon {...p} d={<><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></>} />,
  Smartphone: (p) => <Icon {...p} d={<><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></>} />,
  Tablet: (p) => <Icon {...p} d={<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/></>} />,
  Trash: (p) => <Icon {...p} d={<><path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></>} />,
  LogOut: (p) => <Icon {...p} d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5 M21 12H9"/></>} />,
  Copy: (p) => <Icon {...p} d={<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></>} />,
  Download: (p) => <Icon {...p} d={<><path d="M12 3v13 M7 11l5 5 5-5"/><path d="M4 21h16"/></>} />,
  Plus: (p) => <Icon {...p} d="M12 5v14 M5 12h14" />,
  Settings: (p) => <Icon {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
  Fingerprint: (p) => <Icon {...p} d={<><path d="M12 11v2a8 8 0 0 1-2 6"/><path d="M5 13a7 7 0 0 1 14 0v1"/><path d="M9 11a3 3 0 0 1 6 0v3a8 8 0 0 0 1 4"/><path d="M9 19a8 8 0 0 0 1-3"/><path d="M3 14a9 9 0 0 1 5-8"/><path d="M21 14v-1a9 9 0 0 0-3-7"/></>} />,
  RefreshCcw: (p) => <Icon {...p} d={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>} />,
  Plug: (p) => <Icon {...p} d={<><path d="M12 22v-5"/><path d="M9 8V2 M15 8V2"/><rect x="6" y="8" width="12" height="9" rx="2"/></>} />,
}
