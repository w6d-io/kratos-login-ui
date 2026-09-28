import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import { signUpMethodsService } from '@/lib/sign-up-methods-server'

export const dynamic = 'force-dynamic'

/**
 * The sign-up methods Kratos' identity schema allows — what the first sign-up step promises
 * ("we'll email you a code" vs "you'll choose a password"). Always 200; `methods: null` when unknown.
 */
export async function GET() {
  const methods = await signUpMethodsService(config.kratos.publicUrl)()
  return NextResponse.json({ methods }, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
