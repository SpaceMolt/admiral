'use client'

import { useState } from 'react'
import { KeyRound, Wifi, WifiOff, Search, Server } from 'lucide-react'
import type { Provider } from '@/types'
import type { DisplayFormat } from '@/components/JsonHighlight'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

const DEFAULT_LOCAL_URLS: Record<string, string> = {
  ollama: 'http://127.0.0.1:11434',
  lmstudio: 'http://127.0.0.1:1234',
}

const PROVIDER_INFO: Record<string, { label: string; description: string; isLocal: boolean; keyPlaceholder: string }> = {
  anthropic: { label: 'Anthropic', description: 'Claude models', isLocal: false, keyPlaceholder: 'sk-ant-...' },
  openai: { label: 'OpenAI', description: 'GPT models', isLocal: false, keyPlaceholder: 'sk-...' },
  groq: { label: 'Groq', description: 'Fast inference', isLocal: false, keyPlaceholder: 'gsk_...' },
  google: { label: 'Google AI', description: 'Gemini models', isLocal: false, keyPlaceholder: 'AI...' },
  xai: { label: 'xAI', description: 'Grok models', isLocal: false, keyPlaceholder: 'xai-...' },
  mistral: { label: 'Mistral', description: 'Mistral models', isLocal: false, keyPlaceholder: '' },
  openrouter: { label: 'OpenRouter', description: 'Multi-provider gateway', isLocal: false, keyPlaceholder: 'sk-or-...' },
  ollama: { label: 'Ollama', description: 'Local models', isLocal: true, keyPlaceholder: '' },
  lmstudio: { label: 'LM Studio', description: 'Local models', isLocal: true, keyPlaceholder: '' },
}

interface Props {
  providers: Provider[]
  displayFormat: DisplayFormat
  onDisplayFormatChange: (fmt: DisplayFormat) => void
  registrationCode: string
  onRegistrationCodeChange: (code: string) => void
  gameserverUrl: string
  onGameserverUrlChange: (url: string) => void
  onDone: () => void
}

export function ProviderSetup({ providers: initialProviders, displayFormat, onDisplayFormatChange, registrationCode, onRegistrationCodeChange, gameserverUrl, onGameserverUrlChange, onDone }: Props) {
  const [providers, setProviders] = useState(initialProviders)
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of initialProviders) m[p.id] = p.api_key || ''
    return m
  })
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const p of initialProviders) {
      if (DEFAULT_LOCAL_URLS[p.id]) {
        // Strip /v1 suffix for display (stored as .../v1 internally)
        const stored = p.base_url?.replace(/\/v1\/?$/, '') || ''
        m[p.id] = stored || DEFAULT_LOCAL_URLS[p.id]
      }
    }
    return m
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [detecting, setDetecting] = useState(false)

  const hasValid = providers.some(p => p.status === 'valid')

  async function saveKey(id: string) {
    setSaving(s => ({ ...s, [id]: true }))
    try {
      const resp = await fetch('/api/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, api_key: keys[id] || '' }),
      })
      const result = await resp.json()
      setProviders(prev => prev.map(p => p.id === id ? { ...p, status: result.status, api_key: keys[id] || '' } : p))
    } finally {
      setSaving(s => ({ ...s, [id]: false }))
    }
  }

  async function saveLocalUrl(id: string) {
    setSaving(s => ({ ...s, [id]: true }))
    try {
      const baseUrl = (urls[id] || DEFAULT_LOCAL_URLS[id]).replace(/\/+$/, '') + '/v1'
      const resp = await fetch('/api/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, api_key: '', base_url: baseUrl }),
      })
      const result = await resp.json()
      setProviders(prev => prev.map(p => p.id === id ? { ...p, status: result.status, base_url: baseUrl } : p))
    } finally {
      setSaving(s => ({ ...s, [id]: false }))
    }
  }

  async function detectLocal() {
    setDetecting(true)
    try {
      // Pass custom URLs for detection
      const customUrls: Record<string, string> = {}
      for (const [id, url] of Object.entries(urls)) {
        if (url && url !== DEFAULT_LOCAL_URLS[id]) {
          customUrls[id] = url.replace(/\/+$/, '')
        }
      }
      const resp = await fetch('/api/providers/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: customUrls }),
      })
      const results = await resp.json()
      setProviders(prev => {
        const updated = [...prev]
        for (const r of results as Array<{ id: string; status: string; baseUrl: string }>) {
          const idx = updated.findIndex(p => p.id === r.id)
          if (idx >= 0) updated[idx] = { ...updated[idx], status: r.status as Provider['status'], base_url: r.baseUrl }
        }
        return updated
      })
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-8 overflow-y-auto h-screen">
      <div className="max-w-2xl w-full">
        <h1 className="font-orbitron text-heading font-medium text-primary mb-1 tracking-tight">ADMIRAL</h1>
        <p className="text-[13px] text-muted-foreground mb-8 leading-relaxed">SpaceMolt Agent Manager -- Configure your LLM providers to get started.</p>

        <div className="flex gap-3 mb-5">
          <Button
            variant="outline"
            onClick={detectLocal}
            disabled={detecting}
            className="gap-2 hover:text-primary hover:border-primary/40"
          >
            <Search size={14} />
            {detecting ? 'Scanning...' : 'Detect Local Providers'}
          </Button>
        </div>

        <div className="space-y-2">
          {providers.map(p => {
            const info = PROVIDER_INFO[p.id] || { label: p.id, description: '', isLocal: false, keyPlaceholder: '' }
            return (
              <Card key={p.id} className="card-glow p-3.5">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${
                    p.status === 'valid' ? 'status-dot-green' :
                    p.status === 'invalid' ? 'status-dot-red' :
                    p.status === 'unreachable' ? 'status-dot-orange' :
                    'status-dot-grey'
                  }`} />
                  <span className="text-sm font-medium text-foreground">{info.label}</span>
                  <span className="text-xs text-muted-foreground">{info.description}</span>
                </div>

                {!info.isLocal && (
                  <div className="flex items-center gap-2.5 mt-2.5 ml-5">
                    <KeyRound size={12} className="text-muted-foreground shrink-0" />
                    <Input
                      type="password"
                      value={keys[p.id] || ''}
                      onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                      placeholder={info.keyPlaceholder || 'API key'}
                      className="flex-1 h-7 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveKey(p.id)}
                      disabled={saving[p.id]}
                      className="hover:text-primary hover:border-primary/40"
                    >
                      {saving[p.id] ? '...' : 'Save'}
                    </Button>
                  </div>
                )}
                {info.isLocal && (
                  <>
                    <div className="flex items-center gap-2.5 mt-2.5 ml-5">
                      <Server size={12} className="text-muted-foreground shrink-0" />
                      <Input
                        value={urls[p.id] || DEFAULT_LOCAL_URLS[p.id] || ''}
                        onChange={e => setUrls(u => ({ ...u, [p.id]: e.target.value }))}
                        placeholder={DEFAULT_LOCAL_URLS[p.id] || 'http://host:port'}
                        className="flex-1 h-7 text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveLocalUrl(p.id)}
                        disabled={saving[p.id]}
                        className="hover:text-primary hover:border-primary/40"
                      >
                        {saving[p.id] ? '...' : 'Save'}
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 ml-5">
                      {p.status === 'valid' ? (
                        <><Wifi size={11} className="text-[hsl(var(--smui-green))]" /><span className="text-[11px] text-[hsl(var(--smui-green))]">Running</span></>
                      ) : (
                        <><WifiOff size={11} className="text-muted-foreground" /><span className="text-[11px] text-muted-foreground">Not detected</span></>
                      )}
                    </div>
                  </>
                )}
              </Card>
            )
          })}
        </div>

        {/* Display Preferences */}
        <div className="h-[1px] bg-border my-6" />
        <div>
          <span className="text-[11px] text-[hsl(var(--smui-orange))] uppercase tracking-[1.5px] font-medium">Display Preferences</span>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs text-muted-foreground">Data format</span>
            <div className="flex items-center border border-border">
              <button
                onClick={() => onDisplayFormatChange('json')}
                className={`px-3 py-1.5 text-xs uppercase tracking-[1.5px] transition-colors ${
                  displayFormat === 'json' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => onDisplayFormatChange('yaml')}
                className={`px-3 py-1.5 text-xs uppercase tracking-[1.5px] transition-colors ${
                  displayFormat === 'yaml' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                YAML
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground">
              How expanded log entries display structured data
            </span>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs text-muted-foreground">Registration code</span>
            <Input
              value={registrationCode}
              onChange={e => onRegistrationCodeChange(e.target.value)}
              placeholder="From spacemolt.com/dashboard"
              className="flex-1 h-7 text-xs max-w-[280px]"
            />
            <span className="text-[11px] text-muted-foreground">
              Required for new player registration
            </span>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="text-xs text-muted-foreground">Gameserver URL</span>
            <Input
              value={gameserverUrl}
              onChange={e => onGameserverUrlChange(e.target.value)}
              placeholder="https://game.spacemolt.com"
              className="flex-1 h-7 text-xs max-w-[280px]"
            />
            <span className="text-[11px] text-muted-foreground">
              Default server for new profiles
            </span>
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <Button
            onClick={onDone}
            className="gap-2 text-xs font-medium uppercase tracking-[1.5px]"
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
