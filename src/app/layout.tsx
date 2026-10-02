import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { PublicEnvScript, env } from 'next-runtime-env'
import { AppShell } from '@/components/ui/AppShell'
import { readBrandLogos } from '@/lib/brand-logo'
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
  // Read per request (env() opts out of static rendering), so logos are runtime config.
  const logos = readBrandLogos((k) => env(k))
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <PublicEnvScript />
        <link rel="icon" href={logos.faviconUrl} />
        {logos.logoSmallUrl && <link rel="apple-touch-icon" href={logos.logoSmallUrl} />}
        {/* Set theme as early as possible to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches,d=m;try{var t=localStorage.getItem('theme');if(t==='dark')d=true;else if(t==='light')d=false}catch(e){}document.documentElement.dataset.dark=d?'1':'0'})();`,
          }}
        />
      </head>
      <body>
        <AppShell logoUrl={logos.logoUrl} logoSmallUrl={logos.logoSmallUrl}>{children}</AppShell>
      </body>
    </html>
  )
}
