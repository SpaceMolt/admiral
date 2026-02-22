'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Save, Loader2, ChevronDown } from 'lucide-react'
import type { Profile, Provider } from '@/types'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface Props {
  profile?: Profile | null
  providers: Provider[]
  defaultServerUrl?: string
  onSave: (data: Partial<Profile>) => void
  onCancel: () => void
}

const EMPIRES = ['solarian', 'voidborn', 'crimson', 'nebula', 'outerrim']
const CONNECTION_MODES: { value: string; label: string }[] = [
  { value: 'http', label: 'HTTP API v1' },
  { value: 'http_v2', label: 'HTTP API v2' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'mcp', label: 'MCP v1' },
  { value: 'mcp_v2', label: 'MCP v2' },
]

export function ProfileEditor({ profile, providers, defaultServerUrl, onSave, onCancel }: Props) {
  const [name, setName] = useState(profile?.name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [password, setPassword] = useState(profile?.password || '')
  const [empire, setEmpire] = useState(profile?.empire || '')
  const [provider, setProvider] = useState(profile?.provider || '')
  const [model, setModel] = useState(profile?.model || '')
  const [directive, setDirective] = useState(profile?.directive || '')
  const [connectionMode, setConnectionMode] = useState<string>(profile?.connection_mode || 'http')
  const [serverUrl, setServerUrl] = useState(profile?.server_url || defaultServerUrl || 'https://game.spacemolt.com')
  const [error, setError] = useState('')

  const isNew = !profile
  const availableProviders = ['manual', ...providers.filter(p => p.status === 'valid' || p.api_key).map(p => p.id)]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    onSave({
      name: name.trim(),
      username: username || null,
      password: password || null,
      empire,
      provider: provider || null,
      model: provider === 'manual' ? null : (model || null),
      directive,
      connection_mode: connectionMode as Profile['connection_mode'],
      server_url: serverUrl,
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between h-12 px-6 border-b border-border bg-card">
        <h2 className="text-xs text-primary uppercase tracking-[1.5px] font-medium">
          {isNew ? 'New Profile' : 'Edit Profile'}
        </h2>
        <Button variant="ghost" size="icon" onClick={onCancel} className="h-7 w-7 text-muted-foreground hover:text-foreground">
          <X size={16} />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-lg space-y-5">
          {error && <div className="text-destructive text-xs bg-destructive/10 border border-destructive/30 px-3 py-2">{error}</div>}

          <Field label="Profile Name" required>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vex, Trader, Scout" />
          </Field>

          <div className="h-[1px] bg-border" />

          <div>
            <span className="text-[11px] text-[hsl(var(--smui-orange))] uppercase tracking-[1.5px] font-medium">SpaceMolt Credentials</span>
            <p className="text-[11px] text-muted-foreground mt-1 mb-3">Leave blank to register as a new player on connect.</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Username">
                <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="(new player)" />
              </Field>
              <Field label="Empire">
                <Select value={empire} onChange={e => setEmpire(e.target.value)}>
                  <option value="">Choose...</option>
                  {EMPIRES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </Select>
              </Field>
            </div>

            {username && (
              <Field label="Password" className="mt-3">
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="256-bit hex" />
              </Field>
            )}
          </div>

          <div className="h-[1px] bg-border" />

          <div>
            <span className="text-[11px] text-[hsl(var(--smui-orange))] uppercase tracking-[1.5px] font-medium">Agent Configuration</span>

            <div className="grid grid-cols-2 gap-4 mt-3">
              <Field label="Provider">
                <Select value={provider} onChange={e => { setProvider(e.target.value); setModel('') }}>
                  <option value="">Choose...</option>
                  {availableProviders.map(p => <option key={p} value={p}>{p === 'manual' ? 'Manual (no LLM)' : p}</option>)}
                </Select>
              </Field>
              {provider && provider !== 'manual' && (
                <Field label="Model">
                  <ModelPicker provider={provider} value={model} onChange={setModel} />
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3">
              <Field label="Connection Mode">
                <Select value={connectionMode} onChange={e => setConnectionMode(e.target.value)}>
                  {CONNECTION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Server URL">
                <Input value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
              </Field>
            </div>

            <Field label="Directive / Mission" className="mt-3">
              <Textarea
                value={directive}
                onChange={e => setDirective(e.target.value)}
                placeholder="e.g. Mine ore and sell it until you can buy a better ship"
                rows={3}
                className="resize-none"
              />
            </Field>
          </div>

          <div className="h-[1px] bg-border" />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium uppercase tracking-[1.5px]"
            >
              <Save size={14} />
              {isNew ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function ModelPicker({ provider, value, onChange }: { provider: string; value: string; onChange: (v: string) => void }) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`)
      const data = await resp.json()
      setModels(data.models || [])
    } catch {
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [provider])

  // Fetch models when provider changes
  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = filter
    ? models.filter(m => m.toLowerCase().includes(filter.toLowerCase()))
    : models

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          ref={inputRef}
          value={open ? filter : value}
          onChange={e => {
            if (open) {
              setFilter(e.target.value)
            } else {
              onChange(e.target.value)
            }
          }}
          onFocus={() => {
            setOpen(true)
            setFilter(value)
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
            if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (filtered.length === 1) {
                onChange(filtered[0])
              } else if (filter) {
                onChange(filter)
              }
              setOpen(false)
            }
          }}
          placeholder="e.g. claude-sonnet-4-20250514"
          className="flex h-9 w-full bg-background border border-input px-2.5 py-1.5 text-sm font-jetbrains text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px]"
        />
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false)
            } else {
              setOpen(true)
              setFilter(value)
              inputRef.current?.focus()
            }
          }}
          className="flex items-center justify-center w-8 h-9 border border-l-0 border-input bg-background text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-background border border-border shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={11} className="animate-spin" /> Loading models...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {models.length === 0 ? 'No models found. Type a model ID manually.' : 'No matches. Press Enter to use typed value.'}
            </div>
          ) : (
            filtered.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(m); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-jetbrains hover:bg-primary/10 transition-colors ${
                  m === value ? 'text-primary bg-primary/5' : 'text-foreground'
                }`}
              >
                {m}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="text-[11px] text-muted-foreground uppercase tracking-[1.5px]">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
