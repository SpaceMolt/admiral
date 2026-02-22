import { NextResponse } from 'next/server'
import { agentManager } from '@/lib/agent-manager'
import { getProfile } from '@/lib/db'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const action = (body as Record<string, unknown>).action as string || 'connect'

  const profile = getProfile(id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  try {
    if (action === 'disconnect') {
      await agentManager.disconnect(id)
      return NextResponse.json({ connected: false, running: false })
    }

    // Connect
    await agentManager.connect(id)

    // Start LLM loop if provider is configured (not manual mode)
    if (action === 'connect_llm' && profile.provider && profile.provider !== 'manual' && profile.model) {
      await agentManager.startLLM(id)
    }

    const status = agentManager.getStatus(id)
    return NextResponse.json(status)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
