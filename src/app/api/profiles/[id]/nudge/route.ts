import { NextResponse } from 'next/server'
import { agentManager } from '@/lib/agent-manager'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const message = (body as Record<string, unknown>).message as string

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const status = agentManager.getStatus(id)
  if (!status.running) {
    return NextResponse.json({ error: 'Agent is not running' }, { status: 400 })
  }

  agentManager.nudge(id, message.trim())
  return NextResponse.json({ ok: true })
}
