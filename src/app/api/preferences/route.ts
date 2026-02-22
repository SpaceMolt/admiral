import { NextResponse } from 'next/server'
import { getAllPreferences, setPreference } from '@/lib/db'

export async function GET() {
  return NextResponse.json(getAllPreferences())
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { key, value } = body as { key: string; value: string }

  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'Missing key or value' }, { status: 400 })
  }

  setPreference(key, value)
  return NextResponse.json({ key, value })
}
