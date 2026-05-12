import { NextResponse } from 'next/server'

/**
 * Runtime config endpoint — exposes environment variables to the client.
 * Avoids Next.js NEXT_PUBLIC_* bake-in-at-build-time limitation.
 */
export function GET() {
  return NextResponse.json({
    kratosUrl: process.env.KRATOS_BROWSER_URL || process.env.NEXT_PUBLIC_KRATOS_BROWSER_URL || 'http://kratos:4433',
    defaultReturnUrl: process.env.DEFAULT_RETURN_URL || process.env.NEXT_PUBLIC_DEFAULT_RETURN_URL || '/',
    appName: process.env.APP_NAME || process.env.NEXT_PUBLIC_APP_NAME || '',
  })
}
