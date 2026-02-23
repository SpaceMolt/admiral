import { NextResponse } from 'next/server'
import { listProviders, upsertProvider } from '@/lib/db'
import { validateApiKey } from '@/lib/providers'

export async function GET() {
  return NextResponse.json(listProviders())
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { id, api_key, base_url } = body as { id: string; api_key: string; base_url?: string }

  if (!id) {
    return NextResponse.json({ error: 'Missing provider id' }, { status: 400 })
  }

  let status = 'unknown'
  if (id === 'custom' && base_url) {
    // For custom provider, check if the endpoint is reachable
    try {
      const modelsUrl = base_url.replace(/\/+$/, '') + '/models'
      const headers: Record<string, string> = {}
      if (api_key) headers['Authorization'] = `Bearer ${api_key}`
      const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(5000) })
      status = resp.ok ? 'valid' : 'unreachable'
    } catch {
      status = 'unreachable'
    }
  } else if (api_key) {
    const valid = await validateApiKey(id, api_key)
    status = valid ? 'valid' : 'invalid'
  }

  upsertProvider(id, api_key || '', base_url || '', status)
  return NextResponse.json({ id, status })
}
