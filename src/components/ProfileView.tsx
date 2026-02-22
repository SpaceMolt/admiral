'use client'

import { useState, useCallback } from 'react'
import { Play, Square, Plug, PlugZap, Settings, Trash2 } from 'lucide-react'
import type { Profile } from '@/types'
import { PlayerStatus } from './PlayerStatus'
import { CommandPanel } from './CommandPanel'
import { QuickCommands } from './QuickCommands'
import { LogPane } from './LogPane'

interface Props {
  profile: Profile
  status: { connected: boolean; running: boolean }
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}

export function ProfileView({ profile, status, onEdit, onDelete, onRefresh }: Props) {
  const [playerData, setPlayerData] = useState<Record<string, unknown> | null>(null)
  const [connecting, setConnecting] = useState(false)

  const isManual = !profile.provider || profile.provider === 'manual'

  async function handleConnect() {
    setConnecting(true)
    try {
      const action = isManual ? 'connect' : 'connect_llm'
      await fetch(`/api/profiles/${profile.id}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      onRefresh()
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    await fetch(`/api/profiles/${profile.id}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    })
    onRefresh()
  }

  const handleSendCommand = useCallback(async (command: string, args?: Record<string, unknown>) => {
    try {
      const resp = await fetch(`/api/profiles/${profile.id}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
      })
      const result = await resp.json()

      // If this was get_status, update player data
      if (command === 'get_status' && result.result) {
        setPlayerData(result.result as Record<string, unknown>)
      }
    } catch {
      // Error logged by agent
    }
  }, [profile.id])

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-deep-void border-b border-hull-grey/40">
        <div className={`status-dot ${
          status.running ? 'status-dot-green' :
          status.connected ? 'status-dot-orange' :
          'status-dot-grey'
        }`} />
        <h2 className="font-orbitron text-sm font-bold text-star-white tracking-wider">{profile.name}</h2>
        {profile.username && (
          <span className="font-jetbrains text-[11px] text-chrome-silver/40">@{profile.username}</span>
        )}
        <span className="font-jetbrains text-[10px] text-hull-grey/80 uppercase tracking-wider px-1.5 py-0.5 border border-hull-grey/25 rounded bg-hull-grey/5">
          {profile.connection_mode}
        </span>
        {!isManual && profile.provider && (
          <span className="font-jetbrains text-[10px] text-void-purple/80">
            {profile.provider}/{profile.model}
          </span>
        )}

        <div className="flex-1" />

        {!status.connected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-jetbrains font-semibold bg-bio-green/15 text-bio-green border border-bio-green/25 rounded hover:bg-bio-green/25 transition-colors disabled:opacity-50"
          >
            {connecting ? <PlugZap size={12} className="animate-pulse" /> : <Plug size={12} />}
            {connecting ? 'Connecting...' : (isManual ? 'Connect' : 'Connect + Start')}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-jetbrains font-semibold bg-claw-red/15 text-claw-red border border-claw-red/25 rounded hover:bg-claw-red/25 transition-colors"
          >
            <Square size={12} />
            Disconnect
          </button>
        )}

        <div className="flex items-center gap-0.5 ml-1">
          <button onClick={onEdit} className="p-1.5 text-hull-grey hover:text-chrome-silver transition-colors">
            <Settings size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-hull-grey hover:text-claw-red transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Player status */}
      <PlayerStatus data={playerData} />

      {/* Quick commands */}
      <QuickCommands onSend={handleSendCommand} disabled={!status.connected} />

      {/* Manual command input */}
      <CommandPanel onSend={handleSendCommand} disabled={!status.connected} />

      {/* Log pane */}
      <div className="flex-1 min-h-0">
        <LogPane profileId={profile.id} connected={status.connected} />
      </div>
    </div>
  )
}
