import { ReactNode } from 'react'
import { Logo } from './Logo'
import { config } from '@/lib/config'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-gray-400">{subtitle}</p>
          )}
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="mt-6 text-center">
            {footer}
          </div>
        )}

        {/* Global Footer */}
        {config.footer.text && (
          <div className="mt-8 text-center text-gray-500 text-sm">
            <p>{config.footer.text}</p>
            {config.footer.links.length > 0 && (
              <div className="mt-2 flex justify-center gap-4">
                {config.footer.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    className="text-gray-400 hover:text-white transition"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
