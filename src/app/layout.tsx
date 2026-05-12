import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { PublicEnvScript, env } from 'next-runtime-env'
import { AppShell } from '@/components/ui/AppShell'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans-runtime' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-runtime' })

export async function generateMetadata(): Promise<Metadata> {
  const appName = env('NEXT_PUBLIC_APP_NAME') || 'Acme ID'
  return {
    title: `Sign in — ${appName}`,
    description: `Authentication for ${appName}`,
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const faviconUrl = env('NEXT_PUBLIC_FAVICON_URL') || '/favicon.ico'
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <PublicEnvScript />
        <link rel="icon" href={faviconUrl} />
        {/* Set theme as early as possible to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.dark=d?'1':'0'}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} ${jetbrains.variable}`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
