'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Square, Plug, PlugZap, Settings, Trash2, Pencil } from 'lucide-react'
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
  registrationCode?: string
  playerData: Record<string, unknown> | null
  onPlayerData: (data: Record<string, unknown>) => void
  onEdit: () => void
  onDelete: () => void
  onRefresh: () => void
}

export function ProfileView({ profile, status, displayFormat, playerData, onPlayerData, onEdit, onDelete, onRefresh }: Props) {
  const [connecting, setConnecting] = useState(false)
  const [editingDirective, setEditingDirective] = useState(false)
  const [directiveValue, setDirectiveValue] = useState(profile.directive || '')
  const directiveInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)

  const isManual = !profile.provider || profile.provider === 'manual'

  // Sync directive when profile changes
  useEffect(() => {
    setDirectiveValue(profile.directive || '')
  }, [profile.directive])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingDirective && directiveInputRef.current) {
      directiveInputRef.current.focus()
      directiveInputRef.current.select()
    }
  }, [editingDirective])

  async function saveDirective() {
    setEditingDirective(false)
    const trimmed = directiveValue.trim()
    if (trimmed === (profile.directive || '')) return
    try {
      await fetch(`/api/profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: trimmed }),
      })
      onRefresh()
    } catch {
      // revert on failure
      setDirectiveValue(profile.directive || '')
    }
  }

  // Auto-fetch status when connection becomes active
  const prevConnected = useRef(false)
  useEffect(() => {
    if (status.connected && !prevConnected.current) {
      // Just connected - auto-fetch status after a short delay for login to complete
      const timer = setTimeout(() => {
        fetch(`/api/profiles/${profile.id}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'get_status' }),
        })
          .then(r => r.json())
          .then(result => {
            if (result.result) onPlayerData(result.result as Record<string, unknown>)
          })
          .catch(() => {})
      }, 500)
      prevConnected.current = status.connected
      return () => clearTimeout(timer)
    }
    prevConnected.current = status.connected
  }, [status.connected, profile.id, onPlayerData])

  // Focus command input on any keystroke (when not already in an input)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length === 1 && commandInputRef.current) {
        commandInputRef.current.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
        onPlayerData(result.result as Record<string, unknown>)
      }
    } catch {
      // Error logged by agent
    }
  }, [profile.id])

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-3 h-12 px-3.5 bg-card border-b border-border">
        <div className={`status-dot ${
          status.running ? 'status-dot-green' :
          status.connected ? 'status-dot-orange' :
          'status-dot-grey'
        }`} />
        <h2 className="text-sm font-semibold text-foreground tracking-wide">{profile.name}</h2>
        {profile.username && (
          <span className="text-[11px] text-muted-foreground">@{profile.username}</span>
        )}
        <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] px-2 py-0.5 border border-border">
          {profile.connection_mode}
        </span>
        {!isManual && profile.provider && (
          <span className="text-[10px] text-[hsl(var(--smui-purple))]">
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
            className="gap-1.5 font-semibold text-[hsl(var(--smui-green))] border-[hsl(var(--smui-green)/0.4)] hover:bg-[hsl(var(--smui-green)/0.1)]"
          >
            {connecting ? <PlugZap size={12} className="animate-pulse" /> : <Plug size={12} />}
            {connecting ? 'Connecting...' : (isManual ? 'Connect' : 'Connect + Start')}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            className="gap-1.5 font-semibold text-destructive border-destructive/40 hover:bg-destructive/10"
          >
            <Square size={12} />
            Disconnect
          </Button>
        )}

        <div className="flex items-center gap-0.5 ml-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <Settings size={14} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { if (window.confirm('Delete this profile and all its logs?')) onDelete() }} className="h-7 w-7 text-muted-foreground hover:text-destructive">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Directive */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 bg-card/50 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] shrink-0">Directive</span>
        {editingDirective ? (
          <input
            ref={directiveInputRef}
            value={directiveValue}
            onChange={e => setDirectiveValue(e.target.value)}
            onBlur={saveDirective}
            onKeyDown={e => {
              if (e.key === 'Enter') saveDirective()
              if (e.key === 'Escape') { setDirectiveValue(profile.directive || ''); setEditingDirective(false) }
            }}
            className="flex-1 min-w-0 bg-transparent border-b border-primary/40 text-xs text-foreground/80 outline-none px-0 py-0"
            placeholder="e.g. Mine ore and sell it until you can buy a better ship"
          />
        ) : (
          <div
            className="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer group"
            onClick={() => setEditingDirective(true)}
          >
            <span className={`text-xs truncate ${directiveValue ? 'text-foreground/80' : 'text-muted-foreground/50 italic'}`}>
              {directiveValue || 'No directive set -- click to add'}
            </span>
            <Pencil size={10} className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
          </div>
        )}
      </div>

      {/* Player status */}
      <PlayerStatus data={playerData} />

      {/* Quick commands */}
      <QuickCommands onSend={handleSendCommand} disabled={!status.connected} />

      {/* Log pane */}
      <div className="flex-1 min-h-0">
        <LogPane profileId={profile.id} connected={status.connected} displayFormat={displayFormat} />
      </div>

      {/* Manual command input */}
      <CommandPanel profileId={profile.id} onSend={handleSendCommand} disabled={!status.connected} commandInputRef={commandInputRef} />
    </div>
  )
}
