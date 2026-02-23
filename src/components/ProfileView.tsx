'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Square, Plug, PlugZap, Trash2, Pencil, Check, X } from 'lucide-react'
import type { Profile, Provider } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ModelPicker } from '@/components/ModelPicker'
import { PlayerStatus } from './PlayerStatus'
import { CommandPanel } from './CommandPanel'
import { QuickCommands } from './QuickCommands'
import { LogPane } from './LogPane'
import { SidePane } from './SidePane'

/**
 * Parse the rendered text from MCP v2 get_status into structured player data.
 * Format: "username [empire] | Ncr | System\nShip: Name (id) | Hull: cur/max | Shield: cur/max ..."
 */
function parseStatusText(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== 'string') return null
  const lines = text.split('\n')
  if (lines.length < 3) return null

  // Line 1: "username [empire] | 3,078cr | SystemName"
  const line1 = lines[0].match(/^(.+?)\s+\[(.+?)\]\s+\|\s+([\d,]+)cr\s+\|\s+(.+)$/)
  if (!line1) return null

  const credits = parseInt(line1[3].replace(/,/g, ''), 10)
  const systemName = line1[4].trim()

  // Line 2: "Ship: Name (id) | Hull: cur/max | Shield: cur/max (+N/tick) | Armor: N | Speed: N"
  const hull = lines[1].match(/Hull:\s*(\d+)\/(\d+)/)
  const shield = lines[1].match(/Shield:\s*(\d+)\/(\d+)/)

  // Line 3: "Fuel: cur/max | Cargo: cur/max | CPU: cur/max | Power: cur/max"
  const fuel = lines[2].match(/Fuel:\s*(\d+)\/(\d+)/)
  const cargo = lines[2].match(/Cargo:\s*(\d+)\/(\d+)/)
  const cpu = lines[2].match(/CPU:\s*(\d+)\/(\d+)/)
  const power = lines[2].match(/Power:\s*(\d+)\/(\d+)/)

  // Line 4: "Docked at: poi_name" or "At: poi_name"
  let poiName = ''
  for (const line of lines.slice(3)) {
    const docked = line.match(/^Docked at:\s*(.+)/)
    const at = line.match(/^At:\s*(.+)/)
    if (docked) { poiName = docked[1].trim(); break }
    if (at) { poiName = at[1].trim(); break }
  }

  return {
    player: { credits, current_system: systemName, current_poi: poiName },
    ship: {
      hull: hull ? parseInt(hull[1]) : 0,
      max_hull: hull ? parseInt(hull[2]) : 0,
      shield: shield ? parseInt(shield[1]) : 0,
      max_shield: shield ? parseInt(shield[2]) : 0,
      fuel: fuel ? parseInt(fuel[1]) : 0,
      max_fuel: fuel ? parseInt(fuel[2]) : 0,
      cargo_used: cargo ? parseInt(cargo[1]) : 0,
      cargo_capacity: cargo ? parseInt(cargo[2]) : 0,
      cpu_used: cpu ? parseInt(cpu[1]) : 0,
      cpu_capacity: cpu ? parseInt(cpu[2]) : 0,
      power_used: power ? parseInt(power[1]) : 0,
      power_capacity: power ? parseInt(power[2]) : 0,
    },
    location: { system_name: systemName, poi_name: poiName },
  }
}

const CONNECTION_MODE_LABELS: Record<string, string> = {
  http: 'HTTP v1',
  http_v2: 'HTTP v2',
  websocket: 'WS',
  mcp: 'MCP v1',
  mcp_v2: 'MCP v2',
}

const CONNECTION_MODES: { value: string; label: string }[] = [
  { value: 'http', label: 'HTTP API v1' },
  { value: 'http_v2', label: 'HTTP API v2' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'mcp', label: 'MCP v1' },
  { value: 'mcp_v2', label: 'MCP v2' },
]

type EditingField = 'name' | 'mode' | 'provider' | 'credentials' | null

interface Props {
  profile: Profile
  providers: Provider[]
  status: { connected: boolean; running: boolean }
  registrationCode?: string
  playerData: Record<string, unknown> | null
  onPlayerData: (data: Record<string, unknown>) => void
  onDelete: () => void
  onRefresh: () => void
  autoEditName?: boolean
  onAutoEditNameDone?: () => void
}

export function ProfileView({ profile, providers, status, playerData, onPlayerData, onDelete, onRefresh, autoEditName, onAutoEditNameDone }: Props) {
  const [showSidePane, setShowSidePane] = useState(true)
  const [sidePaneWidth, setSidePaneWidth] = useState(288)
  const [connecting, setConnecting] = useState(false)
  const [showDirectiveModal, setShowDirectiveModal] = useState(false)
  const [directiveValue, setDirectiveValue] = useState(profile.directive || '')
  const commandInputRef = useRef<HTMLInputElement>(null)
  const resizingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Inline edit state
  const [editing, setEditing] = useState<EditingField>(null)
  const [editName, setEditName] = useState('')
  const [editProvider, setEditProvider] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const editNameRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isManual = !profile.provider || profile.provider === 'manual'
  const availableProviders = ['manual', ...providers.filter(p => p.status === 'valid' || p.api_key).map(p => p.id)]

  // Auto-open name edit for new profiles
  useEffect(() => {
    if (autoEditName) {
      setEditing('name')
      setEditName(profile.name)
      onAutoEditNameDone?.()
    }
  }, [autoEditName, profile.name, onAutoEditNameDone])

  // Close popover on outside click
  useEffect(() => {
    if (!editing) return
    function handleMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditing(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [editing])

  // Close popover on Escape
  useEffect(() => {
    if (!editing) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditing(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [editing])

  // Focus name input when editing name
  useEffect(() => {
    if (editing === 'name' && editNameRef.current) {
      editNameRef.current.focus()
      editNameRef.current.select()
    }
  }, [editing])

  // Sync directive when profile changes (but not if user has an unsaved draft)
  useEffect(() => {
    const draftKey = `admiral-directive-draft-${profile.id}`
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft !== null) {
        setDirectiveValue(draft)
        setShowDirectiveModal(true)
        return
      }
    } catch { /* ignore */ }
    setDirectiveValue(profile.directive || '')
  }, [profile.id, profile.directive])

  function clearDirectiveDraft() {
    try { localStorage.removeItem(`admiral-directive-draft-${profile.id}`) } catch { /* ignore */ }
  }

  function saveDirectiveDraft(value: string) {
    try { localStorage.setItem(`admiral-directive-draft-${profile.id}`, value) } catch { /* ignore */ }
  }

  async function saveDirective() {
    setShowDirectiveModal(false)
    clearDirectiveDraft()
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
      setDirectiveValue(profile.directive || '')
    }
  }

  // Save profile field and optionally reconnect
  async function saveProfileField(data: Partial<Profile>, reconnect?: boolean) {
    try {
      if (reconnect && status.connected) {
        await fetch(`/api/profiles/${profile.id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'disconnect' }),
        })
      }

      await fetch(`/api/profiles/${profile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (reconnect) {
        const newProvider = data.provider !== undefined ? data.provider : profile.provider
        const newIsManual = !newProvider || newProvider === 'manual'
        const action = newIsManual ? 'connect' : 'connect_llm'
        await fetch(`/api/profiles/${profile.id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      }

      onRefresh()
    } catch {
      // ignore
    }
  }

  async function handleSaveName() {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === profile.name) {
      setEditing(null)
      return
    }
    setEditing(null)
    await saveProfileField({ name: trimmed })
  }

  async function handleSelectMode(mode: string) {
    if (mode === profile.connection_mode) {
      setEditing(null)
      return
    }
    setEditing(null)
    await saveProfileField({ connection_mode: mode as Profile['connection_mode'] }, true)
  }

  async function handleSaveProvider() {
    const newProvider = editProvider || null
    const newModel = editProvider === 'manual' ? null : (editModel || null)
    if (newProvider === (profile.provider || null) && newModel === (profile.model || null)) {
      setEditing(null)
      return
    }
    setEditing(null)
    await saveProfileField({ provider: newProvider, model: newModel }, true)
  }

  async function handleSaveCredentials() {
    setEditing(null)
    await saveProfileField({
      username: editUsername || null,
      password: editPassword || null,
    })
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
        // Prefer structuredContent (JSON) over result (may be text-only for MCP v2)
        const data = result.structuredContent ?? result.result
        if (data && typeof data === 'object' && ('player' in data || 'ship' in data || 'location' in data)) {
          onPlayerData(data as Record<string, unknown>)
        } else if (data && typeof data === 'object' && 'text' in data) {
          // MCP v2 returns rendered text for queries — parse it
          const parsed = parseStatusText(data.text as string)
          if (parsed) onPlayerData(parsed)
        }
      })
      .catch(() => {})
  }, [profile.id, onPlayerData])

  // Reset connection tracking when connection mode changes (forces re-fetch)
  const prevConnected = useRef(false)
  useEffect(() => {
    prevConnected.current = false
  }, [profile.connection_mode])

  // Auto-fetch status when connection becomes active + poll every 60s
  useEffect(() => {
    if (status.connected && !prevConnected.current) {
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
      if (editing) return
      if (e.key.length === 1 && commandInputRef.current) {
        commandInputRef.current.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing])

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

      if (command === 'get_status') {
        const data = result.structuredContent ?? result.result
        if (data && typeof data === 'object' && ('player' in data || 'ship' in data || 'location' in data)) {
          onPlayerData(data as Record<string, unknown>)
        } else if (data && typeof data === 'object' && 'text' in data) {
          const parsed = parseStatusText(data.text as string)
          if (parsed) onPlayerData(parsed)
        }
      }
    } catch {
      // Error logged by agent
    }
  }, [profile.id])

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div data-tour="navbar" className="flex items-center gap-3 h-12 px-3.5 bg-card border-b border-border">
        <div className={`status-dot ${
          status.running ? 'status-dot-green' :
          status.connected ? 'status-dot-orange' :
          'status-dot-grey'
        }`} />

        {/* Editable profile name */}
        <div className="relative" data-tour="profile-name">
          <h2
            className="text-sm font-semibold text-foreground tracking-wide cursor-pointer hover:text-primary transition-colors"
            onClick={() => { setEditing('name'); setEditName(profile.name) }}
          >
            {profile.name}
          </h2>
          {editing === 'name' && (
            <div ref={popoverRef} className="absolute z-50 top-full left-0 mt-1.5 bg-card border border-border shadow-lg p-2.5 min-w-[220px]">
              <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1.5">Profile Name</span>
              <div className="flex gap-1.5">
                <Input
                  ref={editNameRef}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="h-7 text-xs"
                />
                <Button variant="ghost" size="icon" onClick={handleSaveName} className="h-7 w-7 shrink-0 text-[hsl(var(--smui-green))] hover:bg-[hsl(var(--smui-green)/0.1)]">
                  <Check size={13} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEditing(null)} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Player color swatch + Editable @username / credentials */}
        {playerData && (playerData.player as Record<string, unknown>)?.color_primary ? (
          <svg width="12" height="12" viewBox="0 0 12 12" className="shrink-0">
            <polygon points="0,0 12,0 0,12" fill={(playerData.player as Record<string, unknown>).color_primary as string} />
            <polygon points="12,0 12,12 0,12" fill={(playerData.player as Record<string, unknown>).color_secondary as string || (playerData.player as Record<string, unknown>).color_primary as string} />
          </svg>
        ) : null}
        <div className="relative" data-tour="credentials">
          <span
            className={`text-[11px] cursor-pointer transition-colors ${
              profile.username
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-muted-foreground/40 italic hover:text-muted-foreground'
            }`}
            onClick={() => {
              setEditing('credentials')
              setEditUsername(profile.username || '')
              setEditPassword(profile.password || '')
            }}
          >
            {profile.username ? `@${profile.username}` : '@credentials'}
          </span>
          {editing === 'credentials' && (
            <div ref={popoverRef} className="absolute z-50 top-full left-0 mt-1.5 bg-card border border-border shadow-lg p-2.5 min-w-[280px]">
              <span className="text-[10px] text-[hsl(var(--smui-orange))] uppercase tracking-[1.5px] block mb-2">SpaceMolt Credentials</span>
              <div className="space-y-2">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Username</span>
                  <Input
                    value={editUsername}
                    onChange={e => setEditUsername(e.target.value)}
                    placeholder="(new player)"
                    className="h-7 text-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveCredentials()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Password</span>
                  <Input
                    type="password"
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="256-bit hex"
                    className="h-7 text-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveCredentials()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                </div>
                <div className="flex justify-end gap-1.5 pt-1 border-t border-border/50">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-6 text-[10px] px-2">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveCredentials} className="h-6 text-[10px] px-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Editable connection mode */}
        <div className="relative" data-tour="connection-mode">
          <span
            className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] px-2 py-0.5 border border-border cursor-pointer hover:border-primary/40 hover:text-foreground transition-colors"
            onClick={() => setEditing('mode')}
          >
            {CONNECTION_MODE_LABELS[profile.connection_mode] || profile.connection_mode}
          </span>
          {editing === 'mode' && (
            <div ref={popoverRef} className="absolute z-50 top-full left-0 mt-1.5 bg-card border border-border shadow-lg min-w-[180px]">
              <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block px-3 pt-2 pb-1">Connection Mode</span>
              {CONNECTION_MODES.map(m => (
                <button
                  key={m.value}
                  onClick={() => handleSelectMode(m.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                    m.value === profile.connection_mode
                      ? 'text-primary bg-primary/5'
                      : 'text-foreground hover:bg-primary/10'
                  }`}
                >
                  <div className={`w-3 h-3 border flex items-center justify-center shrink-0 ${
                    m.value === profile.connection_mode ? 'border-primary' : 'border-border bg-background'
                  }`}>
                    {m.value === profile.connection_mode && <div className="w-1.5 h-1.5 bg-primary" />}
                  </div>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Editable provider/model */}
        {!isManual && profile.provider && (
          <div className="relative" data-tour="provider-model">
            <span
              className="text-[10px] text-[hsl(var(--smui-purple))] cursor-pointer hover:text-foreground transition-colors"
              onClick={() => { setEditing('provider'); setEditProvider(profile.provider || ''); setEditModel(profile.model || '') }}
            >
              {profile.provider}/{profile.model}
            </span>
            {editing === 'provider' && (
              <div ref={popoverRef} className="absolute z-50 top-full left-0 mt-1.5 bg-card border border-border shadow-lg p-2.5 min-w-[300px]">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1.5">Provider / Model</span>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Provider</span>
                    <Select value={editProvider} onChange={e => { setEditProvider(e.target.value); setEditModel('') }} className="h-7 text-xs">
                      <option value="">Choose...</option>
                      {availableProviders.map(p => <option key={p} value={p}>{p === 'manual' ? 'Manual (no LLM)' : p}</option>)}
                    </Select>
                  </div>
                  {editProvider && editProvider !== 'manual' && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Model</span>
                      <ModelPicker provider={editProvider} value={editModel} onChange={setEditModel} />
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5 pt-1 border-t border-border/50">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-6 text-[10px] px-2">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveProvider} className="h-6 text-[10px] px-2 bg-primary text-primary-foreground hover:bg-primary/90">
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show clickable provider/model area when manual or no provider set */}
        {(isManual || !profile.provider) && (
          <div className="relative" data-tour="provider-model">
            <span
              className="text-[10px] text-muted-foreground/50 italic cursor-pointer hover:text-foreground transition-colors"
              onClick={() => { setEditing('provider'); setEditProvider(profile.provider || ''); setEditModel(profile.model || '') }}
            >
              {isManual && profile.provider ? 'manual' : 'no provider'}
            </span>
            {editing === 'provider' && (
              <div ref={popoverRef} className="absolute z-50 top-full left-0 mt-1.5 bg-card border border-border shadow-lg p-2.5 min-w-[300px]">
                <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1.5">Provider / Model</span>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Provider</span>
                    <Select value={editProvider} onChange={e => { setEditProvider(e.target.value); setEditModel('') }} className="h-7 text-xs">
                      <option value="">Choose...</option>
                      {availableProviders.map(p => <option key={p} value={p}>{p === 'manual' ? 'Manual (no LLM)' : p}</option>)}
                    </Select>
                  </div>
                  {editProvider && editProvider !== 'manual' && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Model</span>
                      <ModelPicker provider={editProvider} value={editModel} onChange={setEditModel} />
                    </div>
                  )}
                  <div className="flex justify-end gap-1.5 pt-1 border-t border-border/50">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)} className="h-6 text-[10px] px-2">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveProvider} className="h-6 text-[10px] px-2 bg-primary text-primary-foreground hover:bg-primary/90">
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {!status.connected ? (
          <Button
            data-tour="connect-btn"
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

        <Button variant="ghost" size="icon" onClick={() => { if (window.confirm('Delete this profile and all its logs?')) onDelete() }} className="h-7 w-7 text-muted-foreground hover:text-destructive ml-1">
          <Trash2 size={14} />
        </Button>
      </div>

      {/* Directive */}
      <div
        data-tour="directive"
        className="flex items-center gap-2 px-3.5 py-1.5 bg-card/50 border-b border-border/30 cursor-pointer group"
        onClick={() => {
          let initial = profile.directive || ''
          try {
            const draft = localStorage.getItem(`admiral-directive-draft-${profile.id}`)
            if (draft !== null) initial = draft
          } catch { /* ignore */ }
          setDirectiveValue(initial)
          setShowDirectiveModal(true)
        }}
      >
        <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] shrink-0">Directive</span>
        <span className={`text-xs truncate flex-1 min-w-0 ${profile.directive ? 'text-foreground/80' : 'text-muted-foreground/50 italic'}`}>
          {profile.directive || 'No directive set -- click to edit'}
        </span>
        <Pencil size={10} className="shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
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
        <div data-tour="log-pane" className="flex-1 min-w-0">
          <LogPane profileId={profile.id} connected={status.connected} />
        </div>
        {showSidePane && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
            />
            <div data-tour="side-pane" style={{ width: sidePaneWidth }} className="shrink-0">
              <SidePane profileId={profile.id} todo={profile.todo} connected={status.connected} playerData={playerData} onRefreshStatus={fetchStatus} />
            </div>
          </>
        )}
      </div>

      {/* Manual command input */}
      <CommandPanel profileId={profile.id} onSend={handleSendCommand} disabled={!status.connected} commandInputRef={commandInputRef} serverUrl={profile.server_url} />

      {/* Directive modal */}
      {showDirectiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80" onClick={() => { clearDirectiveDraft(); setDirectiveValue(profile.directive || ''); setShowDirectiveModal(false) }}>
          <div className="bg-card border border-border shadow-lg w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-orbitron text-xs font-semibold tracking-[1.5px] text-primary uppercase">Agent Directive</span>
              <button onClick={() => { clearDirectiveDraft(); setDirectiveValue(profile.directive || ''); setShowDirectiveModal(false) }} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Tell your AI agent what to do. This directive is sent every turn to guide autonomous behavior.
              </p>
              <textarea
                autoFocus
                value={directiveValue}
                onChange={e => { setDirectiveValue(e.target.value); saveDirectiveDraft(e.target.value) }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { clearDirectiveDraft(); setDirectiveValue(profile.directive || ''); setShowDirectiveModal(false) }
                }}
                placeholder={"e.g. Mine ore and sell it until you can buy a better ship.\nExplore unknown systems and record what you find.\nBecome a pirate -- attack traders and loot their cargo."}
                rows={5}
                className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground outline-none focus:border-primary/40 resize-y min-h-[80px] max-h-[300px] placeholder:text-muted-foreground/40"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { clearDirectiveDraft(); setDirectiveValue(profile.directive || ''); setShowDirectiveModal(false) }} className="h-7 text-[11px] px-3">
                  Cancel
                </Button>
                <Button size="sm" onClick={saveDirective} className="h-7 text-[11px] px-3 bg-primary text-primary-foreground hover:bg-primary/90">
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
