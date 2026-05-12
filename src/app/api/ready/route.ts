import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export async function GET() {
  try {
    // Check Kratos connectivity
    const kratosResponse = await fetch(`${config.kratos.publicUrl}/health/ready`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (!kratosResponse.ok) {
      return NextResponse.json(
        { status: 'error', message: 'Kratos not ready' },
        { status: 503 }
      )
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Kratos unreachable' },
      { status: 503 }
    )
  }
}
