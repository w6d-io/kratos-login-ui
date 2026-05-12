interface BrandMarkProps {
  size?: number
}

export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16" fill="none">
        <path d="M3 3h3v10H3V3zm7 0h3v10h-3V3zM3 7h10v2H3V7z" fill="currentColor" />
      </svg>
    </span>
  )
}
