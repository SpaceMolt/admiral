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
import { SidePane } from './SidePane'

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
  const [showSidePane, setShowSidePane] = useState(true)
  const [sidePaneWidth, setSidePaneWidth] = useState(288)
  const [connecting, setConnecting] = useState(false)
  const [editingDirective, setEditingDirective] = useState(false)
  const [directiveValue, setDirectiveValue] = useState(profile.directive || '')
  const directiveInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const resizingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Fetch player status
  const fetchStatus = useCallback(() => {
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
  }, [profile.id, onPlayerData])

  // Auto-fetch status when connection becomes active + poll every 60s
  const prevConnected = useRef(false)
  useEffect(() => {
    if (status.connected && !prevConnected.current) {
      // Just connected - fetch after short delay for login to complete
      const timer = setTimeout(fetchStatus, 1500)
      prevConnected.current = status.connected
      return () => clearTimeout(timer)
    }
    prevConnected.current = status.connected
  }, [status.connected, fetchStatus])

  // Poll status every 60s while connected
  useEffect(() => {
    if (!status.connected) return
    const interval = setInterval(fetchStatus, 60000)
    return () => clearInterval(interval)
  }, [status.connected, fetchStatus])

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

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startWidth = sidePaneWidth

    function onMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return
      const delta = startX - e.clientX
      const newWidth = Math.max(200, Math.min(600, startWidth + delta))
      setSidePaneWidth(newWidth)
    }

    function onMouseUp() {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sidePaneWidth])

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

      {/* Quick commands + side pane toggle */}
      <QuickCommands
        onSend={handleSendCommand}
        disabled={!status.connected}
        showSidePane={showSidePane}
        onToggleSidePane={() => setShowSidePane(v => !v)}
      />

      {/* Log pane + side pane */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <LogPane profileId={profile.id} connected={status.connected} displayFormat={displayFormat} />
        </div>
        {showSidePane && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
            />
            <div style={{ width: sidePaneWidth }} className="shrink-0">
              <SidePane profileId={profile.id} todo={profile.todo} connected={status.connected} />
            </div>
          </>
        )}
      </div>

      {/* Manual command input */}
      <CommandPanel profileId={profile.id} onSend={handleSendCommand} disabled={!status.connected} commandInputRef={commandInputRef} />
    </div>
  )
}
