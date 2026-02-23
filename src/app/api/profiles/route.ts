import { NextResponse } from 'next/server'
import { listProfiles, createProfile } from '@/lib/db'
import crypto from 'crypto'

export async function GET() {
  return NextResponse.json(listProfiles())
}

export async function POST(request: Request) {
  const body = await request.json()
  const { name, username, password, empire, provider, model, directive, connection_mode, server_url, context_budget } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  try {
    const profile = createProfile({
      id: crypto.randomUUID(),
      name,
      username: username || null,
      password: password || null,
      empire: empire || '',
      player_id: null,
      provider: provider || null,
      model: model || null,
      directive: directive || '',
      todo: '',
      context_budget: context_budget ?? null,
      connection_mode: connection_mode || 'http',
      server_url: server_url || 'https://game.spacemolt.com',
      autoconnect: true,
      enabled: true,
    })
    return NextResponse.json(profile, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'A profile with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
