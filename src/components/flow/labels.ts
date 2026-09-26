/** Kratos' own schema titles ("E-Mail") read oddly next to our copy; normalise the common one. */
export function fieldLabel(label: string | undefined, fallback: string): string {
  if (!label) return fallback
  return /^e-?mail( address)?$/i.test(label.trim()) ? 'Email' : label
}
