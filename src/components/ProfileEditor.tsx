'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import type { Profile, Provider } from '@/types'

interface Props {
  profile?: Profile | null
  providers: Provider[]
  onSave: (data: Partial<Profile>) => void
  onCancel: () => void
}

const EMPIRES = ['solarian', 'voidborn', 'crimson', 'nebula', 'outerrim']
const CONNECTION_MODES = ['http', 'websocket', 'mcp']

export function ProfileEditor({ profile, providers, onSave, onCancel }: Props) {
  const [name, setName] = useState(profile?.name || '')
  const [username, setUsername] = useState(profile?.username || '')
  const [password, setPassword] = useState(profile?.password || '')
  const [empire, setEmpire] = useState(profile?.empire || '')
  const [provider, setProvider] = useState(profile?.provider || '')
  const [model, setModel] = useState(profile?.model || '')
  const [directive, setDirective] = useState(profile?.directive || '')
  const [connectionMode, setConnectionMode] = useState<string>(profile?.connection_mode || 'http')
  const [serverUrl, setServerUrl] = useState(profile?.server_url || 'https://game.spacemolt.com')
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
    <div className="p-6 max-w-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-orbitron text-lg font-bold text-plasma-cyan uppercase tracking-wider">
          {isNew ? 'New Profile' : 'Edit Profile'}
        </h2>
        <button onClick={onCancel} className="text-hull-grey hover:text-star-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-claw-red text-xs font-jetbrains">{error}</div>}

        <Field label="Profile Name" required>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vex, Trader, Scout" className="input-field" />
        </Field>

        <div className="border-t border-hull-grey/30 pt-4">
          <span className="font-jetbrains text-[10px] text-shell-orange uppercase tracking-wider">SpaceMolt Credentials</span>
          <p className="text-[10px] text-chrome-silver/50 font-jetbrains mt-0.5 mb-3">Leave blank to register as a new player on connect.</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="(new player)" className="input-field" />
            </Field>
            <Field label="Empire">
              <select value={empire} onChange={e => setEmpire(e.target.value)} className="input-field">
                <option value="">Choose...</option>
                {EMPIRES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
              </select>
            </Field>
          </div>

          {username && (
            <Field label="Password">
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="256-bit hex" className="input-field" />
            </Field>
          )}
        </div>

        <div className="border-t border-hull-grey/30 pt-4">
          <span className="font-jetbrains text-[10px] text-shell-orange uppercase tracking-wider">Agent Configuration</span>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Provider">
              <select value={provider} onChange={e => setProvider(e.target.value)} className="input-field">
                <option value="">Choose...</option>
                {availableProviders.map(p => <option key={p} value={p}>{p === 'manual' ? 'Manual (no LLM)' : p}</option>)}
              </select>
            </Field>
            {provider && provider !== 'manual' && (
              <Field label="Model">
                <input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. claude-sonnet-4-20250514" className="input-field" />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Connection Mode">
              <select value={connectionMode} onChange={e => setConnectionMode(e.target.value)} className="input-field">
                {CONNECTION_MODES.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </Field>
            <Field label="Server URL">
              <input value={serverUrl} onChange={e => setServerUrl(e.target.value)} className="input-field" />
            </Field>
          </div>

          <Field label="Directive / Mission" className="mt-3">
            <textarea
              value={directive}
              onChange={e => setDirective(e.target.value)}
              placeholder="e.g. Mine ore and sell it until you can buy a better ship"
              rows={3}
              className="input-field resize-none"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-xs font-jetbrains text-chrome-silver hover:text-star-white transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex items-center gap-2 px-5 py-2 font-orbitron text-xs font-semibold uppercase tracking-wider bg-gradient-to-r from-shell-orange to-claw-red text-star-white border border-shell-orange rounded hover:shadow-[0_0_20px_rgba(255,107,53,0.4)] transition-shadow">
            <Save size={14} />
            {isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="font-jetbrains text-[10px] text-chrome-silver uppercase tracking-wider">
        {label}{required && <span className="text-claw-red ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
