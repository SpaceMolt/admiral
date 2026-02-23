import { NextResponse } from 'next/server'
import { getProfile, updateProfile, deleteProfile } from '@/lib/db'
import { agentManager } from '@/lib/agent-manager'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = getProfile(id)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const status = agentManager.getStatus(id)
  return NextResponse.json({ ...profile, ...status })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const profile = updateProfile(id, body)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Restart the agent turn when directive changes so it picks up immediately
  if (body.directive !== undefined) {
    agentManager.restartTurn(id)
  }

  return NextResponse.json(profile)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await agentManager.disconnect(id)
  deleteProfile(id)
  return NextResponse.json({ ok: true })
}
