import { NextResponse } from 'next/server'
import { detectLocalProviders } from '@/lib/providers'

export async function POST(request: Request) {
  let customUrls: Record<string, string> = {}
  try {
    const body = await request.json()
    customUrls = body?.urls || {}
  } catch {
    // No body or invalid JSON is fine
  }

  const results = await detectLocalProviders(customUrls)
  return NextResponse.json(results)
}
