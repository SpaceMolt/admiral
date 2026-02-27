import { useState, useEffect, useRef } from 'react'
import { X, UserPlus, KeyRound, ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ModelPicker } from '@/components/ModelPicker'
import type { Profile, Provider } from '@/types'

interface Props {
  providers: Provider[]
  registrationCode: string
  gameserverUrl: string
  onClose: () => void
  onCreate: (data: Partial<Profile>) => void
  onShowSettings: () => void
}

type Step = 'account' | 'provider'

export function NewProfileWizard({ providers, registrationCode, gameserverUrl, onClose, onCreate, onShowSettings }: Props) {
  const [step, setStep] = useState<Step>('account')
  const [accountMode, setAccountMode] = useState<'new' | 'existing' | null>(null)

  // Account fields
  const [profileName, setProfileName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  // Provider fields
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [contextBudget, setContextBudget] = useState<number | null>(null)

  const validProviders = providers.filter(p => p.status === 'valid' || p.api_key)
  const hasValidProvider = validProviders.length > 0
  const availableProviders = ['manual', ...validProviders.map(p => p.id)]

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // Auto-focus
  useEffect(() => {
    if (step === 'account' && accountMode === 'existing' && usernameRef.current) {
      usernameRef.current.focus()
    }
  }, [step, accountMode])

  useEffect(() => {
    if (step === 'provider' && nameRef.current) {
      nameRef.current.focus()
    }
  }, [step])

  function handleCreate() {
    const data: Partial<Profile> = {
      name: profileName.trim() || 'New Profile',
      connection_mode: 'http',
      provider: provider === 'manual' ? null : (provider || null),
      model: provider && provider !== 'manual' ? (model || null) : null,
      context_budget: provider && provider !== 'manual' ? (contextBudget ?? null) : null,
      server_url: gameserverUrl,
      username: accountMode === 'existing' ? (username || null) : null,
      password: accountMode === 'existing' ? (password || null) : null,
    }
    onCreate(data)
  }

  const canProceedToProvider = accountMode !== null
  const canCreate = !!profileName.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-card border border-border w-full max-w-[520px] flex flex-col z-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between py-2.5 px-4 border-b border-border shrink-0">
          <h2 className="font-orbitron text-sm font-medium text-primary tracking-[1.5px] uppercase">
            New Profile
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px]">
              Step {step === 'account' ? '1' : '2'} of 2
            </span>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-4 space-y-4">
          {step === 'account' && (
            <>
              <div>
                <span className="text-[11px] text-[hsl(var(--smui-orange))] uppercase tracking-[1.5px] font-medium">
                  Player Account
                </span>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Each profile connects to SpaceMolt as a player. You can register a new player or use existing credentials.
                </p>
              </div>

              {/* Registration code warning */}
              {!registrationCode && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 border border-[hsl(var(--smui-yellow)/0.4)] bg-[hsl(var(--smui-yellow)/0.05)]">
                  <AlertTriangle size={14} className="text-[hsl(var(--smui-yellow))] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[hsl(var(--smui-yellow))] font-medium">No registration code</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      A registration code from{' '}
                      <a href="https://spacemolt.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        spacemolt.com/dashboard
                      </a>
                      {' '}is required to register new players. Set it in{' '}
                      <button onClick={onShowSettings} className="text-primary hover:underline">Settings</button>.
                    </p>
                  </div>
                </div>
              )}

              {/* Account mode selection */}
              <div className="space-y-2">
                <button
                  onClick={() => setAccountMode('new')}
                  className={`w-full text-left px-3.5 py-3 border transition-colors ${
                    accountMode === 'new'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserPlus size={14} className={accountMode === 'new' ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="text-xs font-medium text-foreground">Register new player</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-[26px]">
                    A new player will be created when this profile connects. You will choose an empire during the first game session.
                  </p>
                </button>

                <button
                  onClick={() => setAccountMode('existing')}
                  className={`w-full text-left px-3.5 py-3 border transition-colors ${
                    accountMode === 'existing'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound size={14} className={accountMode === 'existing' ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="text-xs font-medium text-foreground">Use existing credentials</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 ml-[26px]">
                    Log in with a username and password token from a previously registered player.
                  </p>
                </button>
              </div>

              {/* Existing account fields */}
              {accountMode === 'existing' && (
                <div className="space-y-2 ml-1 pl-3 border-l-2 border-primary/30">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Username</span>
                    <Input
                      ref={usernameRef}
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. VoidMiner"
                      className="h-7 text-xs"
                      onKeyDown={e => { if (e.key === 'Enter' && canProceedToProvider) setStep('provider') }}
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Password</span>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="256-bit hex token"
                      className="h-7 text-xs"
                      onKeyDown={e => { if (e.key === 'Enter' && canProceedToProvider) setStep('provider') }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'provider' && (
            <>
              <div>
                <span className="text-[11px] text-[hsl(var(--smui-frost-2))] uppercase tracking-[1.5px] font-medium">
                  Profile Setup
                </span>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Name this profile and choose the AI provider that will drive it.
                </p>
              </div>

              {/* No provider warning */}
              {!hasValidProvider && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 border border-[hsl(var(--smui-orange)/0.4)] bg-[hsl(var(--smui-orange)/0.05)]">
                  <AlertTriangle size={14} className="text-[hsl(var(--smui-orange))] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-[hsl(var(--smui-orange))] font-medium">No model providers configured</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      At least one LLM provider (API key or local model) is required for autonomous agents.{' '}
                      <button onClick={onShowSettings} className="text-primary hover:underline">Configure in Settings</button>.
                      You can still create a manual profile to play by typing commands yourself.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Profile Name</span>
                  <Input
                    ref={nameRef}
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    placeholder="e.g. Mining Bot, Scout Alpha"
                    className="h-7 text-xs"
                    onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate() }}
                  />
                </div>

                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Provider</span>
                  <Select
                    value={provider}
                    onChange={e => { setProvider(e.target.value); setModel('') }}
                    className="h-7 text-xs"
                  >
                    <option value="">Choose...</option>
                    {availableProviders.map(p => (
                      <option key={p} value={p}>
                        {p === 'manual' ? 'Manual (no LLM)' : p}
                      </option>
                    ))}
                  </Select>
                </div>

                {provider && provider !== 'manual' && (
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px] block mb-1">Model</span>
                    <ModelPicker provider={provider} value={model} onChange={setModel} />
                  </div>
                )}

                {provider && provider !== 'manual' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-[1.5px]">Context Budget</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {contextBudget !== null ? `${Math.round(contextBudget * 100)}%` : '55% (default)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={90}
                      step={5}
                      value={contextBudget !== null ? Math.round(contextBudget * 100) : 55}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10)
                        setContextBudget(v === 55 ? null : v / 100)
                      }}
                      className="w-full h-1.5 accent-[hsl(var(--smui-purple))] cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
                      <span>5% (small/local)</span>
                      <span>90% (large context)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Controls when context is compacted. Lower values keep less history but run faster on small models.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
          {step === 'account' ? (
            <>
              <div />
              <Button
                size="sm"
                onClick={() => setStep('provider')}
                disabled={!canProceedToProvider}
                className="gap-1.5 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Next
                <ArrowRight size={12} />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('account')}
                className="gap-1.5 h-7 text-xs"
              >
                <ArrowLeft size={12} />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!canCreate}
                className="gap-1.5 h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create Profile
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
