'use client'

import clsx from 'clsx'

interface PasswordStrengthProps {
  password: string
}

function calculateStrength(password: string): number {
  let strength = 0

  if (password.length >= 8) strength++
  if (password.length >= 12) strength++
  if (/[a-z]/.test(password)) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[0-9]/.test(password)) strength++
  if (/[^a-zA-Z0-9]/.test(password)) strength++

  return Math.min(strength, 4)
}

function getStrengthLevel(strength: number): { level: string; color: string } {
  switch (strength) {
    case 0:
    case 1:
      return { level: 'Weak', color: 'bg-red-500' }
    case 2:
      return { level: 'Fair', color: 'bg-yellow-500' }
    case 3:
      return { level: 'Good', color: 'bg-blue-500' }
    case 4:
      return { level: 'Strong', color: 'bg-green-500' }
    default:
      return { level: 'Weak', color: 'bg-red-500' }
  }
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = calculateStrength(password)
  const { level, color } = getStrengthLevel(strength)

  if (!password) {
    return null
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={clsx(
              'h-1 flex-1 rounded-full transition-all',
              i <= strength ? color : 'bg-gray-600'
            )}
          />
        ))}
      </div>
      <p className={clsx('text-sm font-medium', color.replace('bg-', 'text-'))}>
        Password strength: {level}
      </p>
    </div>
  )
}
