import { NextResponse } from 'next/server'
import { protectionService } from '@/lib/sign-in-protection-server'

export const dynamic = 'force-dynamic'

/**
 * Which sign-in flows show the bot check (public site key only) and whether sign-up is open, limited
 * or closed. Always 200: `captcha: null` + open sign-up when jinbe cannot say — the Kratos hook
 * enforces the real settings either way.
 */
export async function GET() {
  const value = await protectionService()()
  return NextResponse.json(value, { headers: { 'Cache-Control': 'public, max-age=10' } })
}
