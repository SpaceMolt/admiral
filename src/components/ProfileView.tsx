'use client'

import { useState, useCallback } from 'react'
import { Play, Square, Plug, PlugZap, Settings, Trash2 } from 'lucide-react'
import type { Profile } from '@/types'
import type { DisplayFormat } from '@/components/JsonHighlight'
import { Button } from '@/components/ui/button'
import { PlayerStatus } from './PlayerStatus'
import { CommandPanel } from './CommandPanel'
import { QuickCommands } from './QuickCommands'
import { LogPane } from './LogPane'

interface Props {
  profile: Profile
  status: { connected: boolean; running: boolean }
  displayFormat: DisplayFormat
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}

export function ProfileView({ profile, status, displayFormat, onEdit, onDelete, onRefresh }: Props) {
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
      <div className="flex items-center gap-3 px-4 py-2.5 bg-card border-b border-border/40">
        <div className={`status-dot ${
          status.running ? 'status-dot-green' :
          status.connected ? 'status-dot-orange' :
          'status-dot-grey'
        }`} />
        <h2 className="font-orbitron text-sm font-bold text-foreground tracking-wider">{profile.name}</h2>
        {profile.username && (
          <span className="font-jetbrains text-[11px] text-muted-foreground/40">@{profile.username}</span>
        )}
        <span className="font-jetbrains text-[10px] text-border/80 uppercase tracking-wider px-1.5 py-0.5 border border-border/25 bg-border/5">
          {profile.connection_mode}
        </span>
        {!isManual && profile.provider && (
          <span className="font-jetbrains text-[10px] text-smui-purple/80">
            {profile.provider}/{profile.model}
          </span>
        )}

        <div className="flex-1" />

        {!status.connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleConnect}
            disabled={connecting}
            className="gap-1.5 font-jetbrains font-semibold bg-smui-green/15 text-smui-green border-smui-green/25 hover:bg-smui-green/25"
          >
            {connecting ? <PlugZap size={12} className="animate-pulse" /> : <Plug size={12} />}
            {connecting ? 'Connecting...' : (isManual ? 'Connect' : 'Connect + Start')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            className="gap-1.5 font-jetbrains font-semibold bg-destructive/15 text-destructive border-destructive/25 hover:bg-destructive/25"
          >
            <Square size={12} />
            Disconnect
          </Button>
        )}

        <div className="flex items-center gap-0.5 ml-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 text-border hover:text-muted-foreground">
            <Settings size={14} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { if (window.confirm('Delete this profile and all its logs?')) onDelete() }} className="h-7 w-7 text-border hover:text-destructive">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Player status */}
      <PlayerStatus data={playerData} />

      {/* Quick commands */}
      <QuickCommands onSend={handleSendCommand} disabled={!status.connected} />

      {/* Manual command input */}
      <CommandPanel profileId={profile.id} onSend={handleSendCommand} disabled={!status.connected} />

      {/* Log pane */}
      <div className="flex-1 min-h-0">
        <LogPane profileId={profile.id} connected={status.connected} displayFormat={displayFormat} />
      </div>
    </div>
  )
}
