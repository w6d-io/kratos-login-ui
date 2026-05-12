'use client'

import { UiText } from '@ory/client'
import clsx from 'clsx'

interface MessagesProps {
  messages?: UiText[]
}

export function Messages({ messages }: MessagesProps) {
  if (!messages || messages.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {messages.map((message, i) => (
        <div
          key={i}
          className={clsx(
            'px-4 py-3 rounded-lg text-sm',
            message.type === 'error' && 'bg-red-900/50 text-red-200 border border-red-700',
            message.type === 'success' && 'bg-green-900/50 text-green-200 border border-green-700',
            message.type === 'info' && 'bg-blue-900/50 text-blue-200 border border-blue-700'
          )}
        >
          {message.text}
        </div>
      ))}
    </div>
  )
}
