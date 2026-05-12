'use client'

import { oauthProviderIcons, getProviderDisplayName } from '@/lib/kratos'

interface OAuthButtonProps {
  provider: string
  action: string
  csrfToken: string
  disabled?: boolean
}

export function OAuthButton({ provider, action, csrfToken, disabled }: OAuthButtonProps) {
  const icon = oauthProviderIcons[provider.toLowerCase()]
  const displayName = getProviderDisplayName(provider)

  return (
    <form action={action} method="POST">
      <input type="hidden" name="csrf_token" value={csrfToken} />
      <input type="hidden" name="provider" value={provider} />
      
      <button
        type="submit"
        disabled={disabled}
        className="w-full flex items-center justify-center gap-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg transition font-medium"
      >
        {icon && (
          <span dangerouslySetInnerHTML={{ __html: icon }} />
        )}
        {disabled ? 'Connecting...' : `Continue with ${displayName}`}
      </button>
    </form>
  )
}
