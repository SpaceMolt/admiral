'use client'

import { useState } from 'react'
import { KeyRound, Wifi, WifiOff, ArrowRight, Search, Server } from 'lucide-react'
import type { Provider } from '@/types'

const DEFAULT_LOCAL_URLS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
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
  onDone: () => void
}

export function ProviderSetup({ providers: initialProviders, onDone }: Props) {
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
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="max-w-2xl w-full">
        <h1 className="font-orbitron text-3xl font-bold text-plasma-cyan mb-2 tracking-wider">ADMIRAL</h1>
        <p className="text-chrome-silver font-jetbrains text-sm mb-8">SpaceMolt Agent Manager -- Configure your LLM providers to get started.</p>

        <div className="flex gap-3 mb-6">
          <button
            onClick={detectLocal}
            disabled={detecting}
            className="flex items-center gap-2 px-4 py-2.5 bg-nebula-blue border border-hull-grey/50 rounded text-sm font-jetbrains text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-50"
          >
            <Search size={14} />
            {detecting ? 'Scanning...' : 'Detect Local Providers'}
          </button>
        </div>

        <div className="space-y-2.5">
          {providers.map(p => {
            const info = PROVIDER_INFO[p.id] || { label: p.id, description: '', isLocal: false, keyPlaceholder: '' }
            return (
              <div key={p.id} className="p-3.5 bg-deep-void border border-hull-grey/30 rounded-md">
                <div className="flex items-center gap-3">
                  <div className={`status-dot ${
                    p.status === 'valid' ? 'status-dot-green' :
                    p.status === 'invalid' ? 'status-dot-red' :
                    p.status === 'unreachable' ? 'status-dot-orange' :
                    'status-dot-grey'
                  }`} />
                  <span className="font-jetbrains text-sm font-semibold text-star-white">{info.label}</span>
                  <span className="font-jetbrains text-xs text-chrome-silver/50">{info.description}</span>
                </div>

                {!info.isLocal && (
                  <div className="flex items-center gap-2.5 mt-2.5 ml-5">
                    <KeyRound size={12} className="text-hull-grey/70 shrink-0" />
                    <input
                      type="password"
                      value={keys[p.id] || ''}
                      onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                      placeholder={info.keyPlaceholder || 'API key'}
                      className="flex-1 bg-space-black border border-hull-grey/30 rounded px-2.5 py-1.5 text-xs font-jetbrains text-star-white placeholder:text-hull-grey/50 focus:border-plasma-cyan focus:outline-none"
                    />
                    <button
                      onClick={() => saveKey(p.id)}
                      disabled={saving[p.id]}
                      className="px-3.5 py-1.5 text-xs font-jetbrains bg-nebula-blue border border-hull-grey/40 rounded text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-50"
                    >
                      {saving[p.id] ? '...' : 'Save'}
                    </button>
                  </div>
                )}
                {info.isLocal && (
                  <>
                    <div className="flex items-center gap-2.5 mt-2.5 ml-5">
                      <Server size={12} className="text-hull-grey/70 shrink-0" />
                      <input
                        value={urls[p.id] || DEFAULT_LOCAL_URLS[p.id] || ''}
                        onChange={e => setUrls(u => ({ ...u, [p.id]: e.target.value }))}
                        placeholder={DEFAULT_LOCAL_URLS[p.id] || 'http://host:port'}
                        className="flex-1 bg-space-black border border-hull-grey/30 rounded px-2.5 py-1.5 text-xs font-jetbrains text-star-white placeholder:text-hull-grey/50 focus:border-plasma-cyan focus:outline-none"
                      />
                      <button
                        onClick={() => saveLocalUrl(p.id)}
                        disabled={saving[p.id]}
                        className="px-3.5 py-1.5 text-xs font-jetbrains bg-nebula-blue border border-hull-grey/40 rounded text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-50"
                      >
                        {saving[p.id] ? '...' : 'Save'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 ml-5">
                      {p.status === 'valid' ? (
                        <><Wifi size={11} className="text-bio-green" /><span className="text-[11px] font-jetbrains text-bio-green">Running</span></>
                      ) : (
                        <><WifiOff size={11} className="text-hull-grey/60" /><span className="text-[11px] font-jetbrains text-hull-grey/60">Not detected</span></>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end mt-8">
          <button
            onClick={onDone}
            className="flex items-center gap-2 px-6 py-2.5 font-orbitron text-sm font-semibold uppercase tracking-wider bg-gradient-to-r from-shell-orange to-claw-red text-star-white border border-shell-orange rounded hover:shadow-[0_0_30px_rgba(255,107,53,0.5)] transition-shadow"
          >
            {hasValid ? 'Continue' : 'Skip for Now'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
