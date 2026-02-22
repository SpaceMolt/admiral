import { NextResponse } from 'next/server'
import { agentManager } from '@/lib/agent-manager'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { command, args } = body as { command: string; args?: Record<string, unknown> }

  if (!command) {
    return NextResponse.json({ error: 'Missing command' }, { status: 400 })
  }

  const agent = agentManager.getAgent(id)
  if (!agent || !agent.isConnected) {
    return NextResponse.json({ error: 'Agent not connected' }, { status: 400 })
  }

  try {
    const result = await agent.executeCommand(command, args)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
