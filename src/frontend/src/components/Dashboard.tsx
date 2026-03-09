import { useState, useEffect, useCallback, useMemo } from 'react'
import { Settings, Sun, Moon, Github, AlertTriangle, CircleHelp, Globe, BarChart3, Coins, Vault } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { Profile, Provider } from '@/types'
import { ProfileList } from './ProfileList'
import { ProfileView } from './ProfileView'
import { FleetMap } from './FleetMap'
import { NewProfileWizard } from './NewProfileWizard'
import { AdmiralTour } from './AdmiralTour'
import { AnalyticsPane } from './AnalyticsPane'

interface Props {
  profiles: Profile[]
  providers: Provider[]
  registrationCode: string
  gameserverUrl: string
  defaultProvider: string
  defaultModel: string
  onRefresh: () => void
  onShowProviders: () => void
}

export function Dashboard({ profiles: initialProfiles, providers, registrationCode, gameserverUrl, defaultProvider, defaultModel, onRefresh, onShowProviders }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeId = searchParams.get('profile') || initialProfiles[0]?.id || ''
  const setActiveId = (id: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (id) { params.set('profile', id) } else { params.delete('profile') }
    setSearchParams(params)
  }
  const [autoEditName, setAutoEditName] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, { connected: boolean; running: boolean }>>({})
  const [playerDataMap, setPlayerDataMap] = useState<Record<string, Record<string, unknown>>>({})
  const [showWizard, setShowWizard] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [view, setView] = useState<'profiles' | 'map' | 'analytics'>('profiles')
  const [warRoom, setWarRoom] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('admiral-sidebar-open') !== 'false' } catch { return true }
  })

  const activeProfile = profiles.find(p => p.id === activeId)

  // Auto-show tour for new users who haven't seen it
  useEffect(() => {
    if (profiles.length > 0 && activeProfile && !showTour) {
      try {
        const seen = localStorage.getItem('admiral-tour-seen')
        if (!seen) setShowTour(true)
      } catch { /* ignore */ }
    }
  }, [profiles.length, !!activeProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll statuses + game state for all profiles in one request
  useEffect(() => {
    async function poll() {
      try {
        const resp = await fetch('/api/profiles')
        const data: Array<Record<string, unknown>> = await resp.json()
        const newStatuses: Record<string, { connected: boolean; running: boolean }> = {}
        const newGameStates: Record<string, Record<string, unknown>> = {}
        for (const p of data) {
          const id = p.id as string
          newStatuses[id] = { connected: !!p.connected, running: !!p.running }
          if (p.gameState && typeof p.gameState === 'object') {
            newGameStates[id] = p.gameState as Record<string, unknown>
          }
        }
        setProfiles(data as unknown as Profile[])
        setStatuses(newStatuses)
        setPlayerDataMap(prev => ({ ...prev, ...newGameStates }))
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [])

  const refreshProfiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/profiles')
      const data: Array<Record<string, unknown>> = await resp.json()
      const newStatuses: Record<string, { connected: boolean; running: boolean }> = {}
      const newGameStates: Record<string, Record<string, unknown>> = {}
      for (const p of data) {
        const id = p.id as string
        newStatuses[id] = { connected: !!p.connected, running: !!p.running }
        if (p.gameState && typeof p.gameState === 'object') {
          newGameStates[id] = p.gameState as Record<string, unknown>
        }
      }
      setProfiles(data as unknown as Profile[])
      setStatuses(newStatuses)
      setPlayerDataMap(prev => ({ ...prev, ...newGameStates }))
    } catch {
      // ignore
    }
  }, [])

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    // Optimistic update
    setProfiles(prev => {
      const byId = new Map(prev.map(p => [p.id, p]))
      return orderedIds.map(id => byId.get(id)!).filter(Boolean)
    })
    try {
      await fetch('/api/profiles/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds }),
      })
    } catch {
      refreshProfiles()
    }
  }, [refreshProfiles])

  function handleNewProfile() {
    setShowWizard(true)
  }

  async function handleWizardCreate(data: Partial<Profile>) {
    setShowWizard(false)
    try {
      const resp = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        const profile = await resp.json()
        setProfiles(prev => [...prev, profile])
        setActiveId(profile.id)
      }
    } catch {
      // ignore
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      setProfiles(prev => prev.filter(p => p.id !== id))
      if (activeId === id) setActiveId(profiles.find(p => p.id !== id)?.id || '')
    } catch {
      // ignore
    }
  }

  const { totalWallet, totalStorage, activeWallet, activeStorage } = useMemo(() => {
    let wallet = 0
    let storage = 0
    let aWallet = 0
    let aStorage = 0
    for (const p of profiles) {
      // Wallet credits from live game state
      const pd = playerDataMap[p.id]
      let pWallet = 0
      if (pd) {
        const player = (pd.player || {}) as Record<string, unknown>
        pWallet = Number(player.credits ?? pd.credits ?? 0)
        wallet += pWallet
      }

      // Storage credits from agent memory ledger
      let pStorage = 0
      if (p.memory) {
        pStorage = parseStorageCreditsFromMemory(p.memory)
        storage += pStorage
      }

      if (p.id === activeId) {
        aWallet = pWallet
        aStorage = pStorage
      }
    }
    return { totalWallet: wallet, totalStorage: storage, activeWallet: aWallet, activeStorage: aStorage }
  }, [profiles, playerDataMap, activeId])

  const hasValidProvider = providers.some(p => p.status === 'valid' || p.api_key)

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar — hidden in war room */}
      {!warRoom && (
      <div className="sticky top-0 z-50 flex items-center justify-between h-12 px-3.5 bg-card border-b border-border">
        <div className="flex items-baseline gap-3">
          <h1 className="font-jetbrains text-sm font-bold tracking-[1.5px] text-primary uppercase">
            ADMIRAL
          </h1>
          <span className="text-[11px] text-muted-foreground tracking-[1.5px] uppercase">SpaceMolt Agent Manager</span>
        </div>
        {(totalWallet > 0 || totalStorage > 0) && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            {(activeProfile ? activeWallet > 0 : totalWallet > 0) && (
              <div className="flex items-center gap-1.5" title={activeProfile ? `${activeProfile.name} wallet (fleet total: ${totalWallet.toLocaleString()})` : 'Total fleet credits (wallet)'}>
                <Coins size={12} className="text-yellow-500/70" />
                <span className="font-mono font-medium text-foreground/80">{(activeProfile ? activeWallet : totalWallet).toLocaleString()}</span>
                <span className="text-[10px]">wallet</span>
              </div>
            )}
            {(activeProfile ? activeStorage > 0 : totalStorage > 0) && (
              <div className="flex items-center gap-1.5" title={activeProfile ? `${activeProfile.name} storage (fleet total: ${totalStorage.toLocaleString()})` : 'Total credits in station storage'}>
                <Vault size={12} className="text-blue-400/70" />
                <span className="font-mono font-medium text-foreground/80">{(activeProfile ? activeStorage : totalStorage).toLocaleString()}</span>
                <span className="text-[10px]">storage</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/SpaceMolt/admiral"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-foreground transition-colors border border-border"
            title="GitHub"
          >
            <Github size={13} />
          </a>
          <button
            onClick={() => setView(v => v === 'map' ? 'profiles' : 'map')}
            className={`flex items-center justify-center w-7 h-7 transition-colors border border-border ${view === 'map' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
            title={view === 'map' ? 'Show profiles' : 'Show fleet map'}
          >
            <Globe size={13} />
          </button>
          <button
            onClick={() => setView(v => v === 'analytics' ? 'profiles' : 'analytics')}
            className={`flex items-center justify-center w-7 h-7 transition-colors border border-border ${view === 'analytics' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
            title={view === 'analytics' ? 'Show profiles' : 'Show analytics'}
          >
            <BarChart3 size={13} />
          </button>
          <ThemeToggle />
          <button
            onClick={() => {
              try { localStorage.removeItem('admiral-tour-seen') } catch {}
              setShowTour(true)
            }}
            className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-foreground transition-colors border border-border"
            title="Take a tour"
          >
            <CircleHelp size={13} />
          </button>
          <button
            onClick={onShowProviders}
            className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider px-2.5 py-1.5 hover:text-foreground transition-colors"
          >
            <Settings size={13} />
            Settings
          </button>
        </div>
      </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden in war room */}
        {sidebarOpen && !warRoom && (
          <div data-tour="sidebar" className="border-r border-border bg-card flex flex-col h-full">
            <ProfileList
              profiles={profiles}
              activeId={activeId}
              statuses={statuses}
              playerDataMap={playerDataMap}
              onSelect={(id) => { setActiveId(id); setView('profiles') }}
              onNew={handleNewProfile}
              onReorder={handleReorder}
            />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {view === 'map' ? (
            <FleetMap
              profiles={profiles}
              statuses={statuses}
              playerDataMap={playerDataMap}
              fullscreen={warRoom}
              onToggleFullscreen={() => setWarRoom(v => !v)}
            />
          ) : view === 'analytics' ? (
            <AnalyticsPane
              profiles={profiles}
              statuses={statuses}
            />
          ) : activeProfile ? (
            <ProfileView
              profile={activeProfile}
              providers={providers}
              status={statuses[activeProfile.id] || { connected: false, running: false }}
              registrationCode={registrationCode}
              playerData={playerDataMap[activeProfile.id] || null}
              onPlayerData={(data) => setPlayerDataMap(prev => ({ ...prev, [activeProfile.id]: data }))}
              onDelete={() => handleDeleteProfile(activeProfile.id)}
              onRefresh={() => {
                refreshProfiles()
              }}
              autoEditName={autoEditName}
              onAutoEditNameDone={() => setAutoEditName(false)}
              showProfileList={sidebarOpen}
              onToggleProfileList={() => setSidebarOpen(v => { const next = !v; try { localStorage.setItem('admiral-sidebar-open', String(next)) } catch {}; return next })}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md px-6">
                <h2 className="font-jetbrains text-xl font-bold tracking-[1.5px] text-primary uppercase mb-3">
                  ADMIRAL
                </h2>
                <p className="text-[11px] text-muted-foreground uppercase tracking-[1.5px] mb-6">
                  SpaceMolt Agent Manager
                </p>

                {/* Warnings */}
                <div className="space-y-2.5 mb-6 text-left">
                  {!hasValidProvider && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 border border-[hsl(var(--smui-orange)/0.4)] bg-[hsl(var(--smui-orange)/0.05)]">
                      <AlertTriangle size={14} className="text-[hsl(var(--smui-orange))] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-[hsl(var(--smui-orange))] font-medium">No model providers configured</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          At least one LLM provider API key or local model is required for AI agents.{' '}
                          <button onClick={onShowProviders} className="text-primary hover:underline">Open Settings</button>
                        </p>
                      </div>
                    </div>
                  )}
                  {!registrationCode && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 border border-[hsl(var(--smui-yellow)/0.4)] bg-[hsl(var(--smui-yellow)/0.05)]">
                      <AlertTriangle size={14} className="text-[hsl(var(--smui-yellow))] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-[hsl(var(--smui-yellow))] font-medium">No registration code</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Needed to register new players. Get one from{' '}
                          <a href="https://spacemolt.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">spacemolt.com/dashboard</a>
                          {' '}and set it in{' '}
                          <button onClick={onShowProviders} className="text-primary hover:underline">Settings</button>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleNewProfile}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium uppercase tracking-[1.5px] text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
                >
                  Create Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wizard modal */}
      {showWizard && (
        <NewProfileWizard
          providers={providers}
          registrationCode={registrationCode}
          gameserverUrl={gameserverUrl}
          defaultProvider={defaultProvider}
          defaultModel={defaultModel}
          onClose={() => setShowWizard(false)}
          onCreate={handleWizardCreate}
          onShowSettings={() => {
            setShowWizard(false)
            onShowProviders()
          }}
        />
      )}

      {/* Tour */}
      {showTour && activeProfile && (
        <AdmiralTour
          onComplete={() => {
            setShowTour(false)
            try { localStorage.setItem('admiral-tour-seen', '1') } catch {}
          }}
        />
      )}
    </div>
  )
}

/**
 * Parse total storage credits from an agent's memory ledger.
 *
 * Section-aware parser: only extracts credits from sections whose headings
 * indicate storage/credits content. Uses summary-vs-individual priority
 * to prevent double-counting when agents list credits in both a summary
 * section and per-station detail sections.
 *
 * Supported formats:
 *   - "- **Station:** 577,067cr"        (CyberSapper summary)
 *   - "- Station storage: 50,000cr"     (Bob Credits & Assets)
 *   - "- **Credits:** 1,268,440"        (CyberSpock per-station)
 *   - "- Credits: 2,202,999"            (Nova per-station detail)
 *   - "- **Station:** 0 credits, ..."   (Morg'Thar station storage)
 *   - "| CCC (Sol) | 2,202,999 |"      (Nova verified ledger table)
 */
function parseStorageCreditsFromMemory(memory: string): number {
  const lines = memory.split('\n')
  let summaryFound = false
  let summaryTotal = 0
  let individualTotal = 0
  let sectionType: 'summary' | 'individual' | 'none' = 'none'

  for (const line of lines) {
    // Track section headers (## or ###)
    if (/^#{2,3}\s/.test(line)) {
      const heading = line.replace(/^#+\s*/, '').trim().toLowerCase()
      // Summary: heading starts with "credits" or has "storage credits" as a phrase
      if (/^credits\b/i.test(heading) || /storage\s+credits/i.test(heading)) {
        sectionType = 'summary'
        summaryFound = true
      // Individual: heading has "storage" but not market/resource noise
      } else if (/storage/i.test(heading) && !/market|palladium|resource|sales log/i.test(heading)) {
        sectionType = 'individual'
      } else {
        sectionType = 'none'
      }
      continue
    }

    if (sectionType === 'none') continue

    const trimmed = line.trim()
    if (!trimmed || trimmed === '|---|---|') continue

    const credits = extractStorageCredits(trimmed)
    if (credits > 0) {
      if (sectionType === 'summary') summaryTotal += credits
      else individualTotal += credits
    }
  }

  return summaryFound ? summaryTotal : individualTotal
}

function extractStorageCredits(trimmed: string): number {
  // Table row: | Name | Number |
  if (trimmed.startsWith('|')) {
    const cells = trimmed.split('|').filter(c => c.trim())
    if (cells.length !== 2) return 0
    const label = cells[0].trim().toLowerCase().replace(/\*/g, '')
    if (/wallet|total|location|credits|^-+$/.test(label)) return 0
    const value = cells[1].trim().replace(/\*/g, '')
    const num = parseInt(value.replace(/,/g, ''), 10)
    return (num > 0 && !isNaN(num)) ? num : 0
  }

  if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) return 0
  const content = trimmed.replace(/^[-*]\s*/, '')
  const clean = content.toLowerCase().replace(/\*/g, '')
  if (/^(wallet|total|sell credit|dock readout|true balance|uncertain|estimated)/i.test(clean)) return 0

  // "**Station:** N,NNNcr" or "Station storage: N,NNNcr"
  const labelCrMatch = content.match(/^(?:\*\*[^*]+\*\*|[^:]+storage)\s*:?\s*([\d,]+)\s*cr\b/i)
  if (labelCrMatch) return parseInt(labelCrMatch[1].replace(/,/g, ''), 10) || 0

  // "Credits: N" or "**Credits:** N" — match on clean (stars stripped)
  const creditsMatch = clean.match(/^credits\s*:?\s*([\d,]+)/i)
  if (creditsMatch) return parseInt(creditsMatch[1].replace(/,/g, ''), 10) || 0

  // "**Station:** N credits" (e.g., "**Ironhearth:** 0 credits, items...")
  const nCreditsMatch = content.match(/^\*\*[^*]+\*\*:?\s*([\d,]+)\s+credits?\b/i)
  if (nCreditsMatch) return parseInt(nCreditsMatch[1].replace(/,/g, ''), 10) || 0

  return 0
}

function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('admiral-theme', next ? 'dark' : 'light') } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-foreground transition-colors border border-border"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun size={13} /> : <Moon size={13} />}
    </button>
  )
}
