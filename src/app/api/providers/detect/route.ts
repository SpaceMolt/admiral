import { NextResponse } from 'next/server'
import { detectLocalProviders } from '@/lib/providers'

export async function POST() {
  const results = await detectLocalProviders()
  return NextResponse.json(results)
}
