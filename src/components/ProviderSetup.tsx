'use client'

import { useState } from 'react'
import { KeyRound, Wifi, WifiOff, ArrowRight, Search } from 'lucide-react'
import type { Provider } from '@/types'

const PROVIDER_INFO: Record<string, { label: string; description: string; isLocal: boolean; keyPlaceholder: string }> = {
  anthropic: { label: 'Anthropic', description: 'Claude models', isLocal: false, keyPlaceholder: 'sk-ant-...' },
  openai: { label: 'OpenAI', description: 'GPT models', isLocal: false, keyPlaceholder: 'sk-...' },
  groq: { label: 'Groq', description: 'Fast inference', isLocal: false, keyPlaceholder: 'gsk_...' },
  google: { label: 'Google AI', description: 'Gemini models', isLocal: false, keyPlaceholder: 'AI...' },
  xai: { label: 'xAI', description: 'Grok models', isLocal: false, keyPlaceholder: 'xai-...' },
  mistral: { label: 'Mistral', description: 'Mistral models', isLocal: false, keyPlaceholder: '' },
  openrouter: { label: 'OpenRouter', description: 'Multi-provider gateway', isLocal: false, keyPlaceholder: 'sk-or-...' },
  ollama: { label: 'Ollama', description: 'Local models (localhost:11434)', isLocal: true, keyPlaceholder: '' },
  lmstudio: { label: 'LM Studio', description: 'Local models (localhost:1234)', isLocal: true, keyPlaceholder: '' },
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

  async function detectLocal() {
    setDetecting(true)
    try {
      const resp = await fetch('/api/providers/detect', { method: 'POST' })
      const results = await resp.json()
      setProviders(prev => {
        const updated = [...prev]
        for (const r of results as Array<{ id: string; status: string }>) {
          const idx = updated.findIndex(p => p.id === r.id)
          if (idx >= 0) updated[idx] = { ...updated[idx], status: r.status as Provider['status'] }
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
            className="flex items-center gap-2 px-4 py-2 bg-nebula-blue border border-hull-grey rounded text-sm font-jetbrains text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-50"
          >
            <Search size={14} />
            {detecting ? 'Scanning...' : 'Detect Local Providers'}
          </button>
        </div>

        <div className="space-y-3">
          {providers.map(p => {
            const info = PROVIDER_INFO[p.id] || { label: p.id, description: '', isLocal: false, keyPlaceholder: '' }
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 bg-deep-void border border-hull-grey/50 rounded">
                <div className={`status-dot ${
                  p.status === 'valid' ? 'status-dot-green' :
                  p.status === 'invalid' ? 'status-dot-red' :
                  p.status === 'unreachable' ? 'status-dot-orange' :
                  'status-dot-grey'
                }`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-jetbrains text-sm font-semibold text-star-white">{info.label}</span>
                    <span className="font-jetbrains text-xs text-chrome-silver/60">{info.description}</span>
                  </div>
                  {!info.isLocal && (
                    <div className="flex items-center gap-2 mt-1">
                      <KeyRound size={12} className="text-hull-grey shrink-0" />
                      <input
                        type="password"
                        value={keys[p.id] || ''}
                        onChange={e => setKeys(k => ({ ...k, [p.id]: e.target.value }))}
                        placeholder={info.keyPlaceholder || 'API key'}
                        className="flex-1 bg-space-black border border-hull-grey/30 rounded px-2 py-1 text-xs font-jetbrains text-star-white placeholder:text-hull-grey focus:border-plasma-cyan focus:outline-none"
                      />
                      <button
                        onClick={() => saveKey(p.id)}
                        disabled={saving[p.id]}
                        className="px-3 py-1 text-xs font-jetbrains bg-nebula-blue border border-hull-grey rounded text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-50"
                      >
                        {saving[p.id] ? '...' : 'Save'}
                      </button>
                    </div>
                  )}
                  {info.isLocal && (
                    <div className="flex items-center gap-1 mt-1">
                      {p.status === 'valid' ? (
                        <><Wifi size={12} className="text-bio-green" /><span className="text-xs font-jetbrains text-bio-green">Running</span></>
                      ) : (
                        <><WifiOff size={12} className="text-hull-grey" /><span className="text-xs font-jetbrains text-hull-grey">Not detected</span></>
                      )}
                    </div>
                  )}
                </div>
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
