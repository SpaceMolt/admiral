'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Sun, Moon, Github, AlertTriangle, CircleHelp } from 'lucide-react'
import { useQueryState } from 'nuqs'
import type { Profile, Provider } from '@/types'
import { ProfileList } from './ProfileList'
import { ProfileView } from './ProfileView'
import { NewProfileWizard } from './NewProfileWizard'
import { AdmiralTour } from './AdmiralTour'

interface Props {
  profiles: Profile[]
  providers: Provider[]
  registrationCode: string
  gameserverUrl: string
  onRefresh: () => void
  onShowProviders: () => void
}

export function Dashboard({ profiles: initialProfiles, providers, registrationCode, gameserverUrl, onRefresh, onShowProviders }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [activeId, setActiveId] = useQueryState('profile', {
    defaultValue: initialProfiles[0]?.id || '',
    shallow: false,
  })
  const [autoEditName, setAutoEditName] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, { connected: boolean; running: boolean }>>({})
  const [playerDataMap, setPlayerDataMap] = useState<Record<string, Record<string, unknown>>>({})
  const [showWizard, setShowWizard] = useState(false)
  const [showTour, setShowTour] = useState(false)
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

  // Fetch player data for a connected profile
  const fetchPlayerData = useCallback(async (profileId: string) => {
    try {
      const resp = await fetch(`/api/profiles/${profileId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'get_status' }),
      })
      const result = await resp.json()
      const data = result.structuredContent ?? result.result
      if (data && typeof data === 'object') {
        if ('player' in data || 'ship' in data || 'location' in data) {
          setPlayerDataMap(prev => ({ ...prev, [profileId]: data }))
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Poll statuses + fetch player data for connected profiles on mount
  const initialFetchDone = useRef(false)
  useEffect(() => {
    async function poll() {
      const connected: string[] = []
      for (const p of profiles) {
        try {
          const resp = await fetch(`/api/profiles/${p.id}`)
          const data = await resp.json()
          const isConnected = !!data.connected
          setStatuses(prev => ({ ...prev, [p.id]: { connected: isConnected, running: !!data.running } }))
          if (isConnected) connected.push(p.id)
        } catch {
          // ignore
        }
      }
      // On first poll, fetch player data for all connected profiles
      if (!initialFetchDone.current && connected.length > 0) {
        initialFetchDone.current = true
        for (const id of connected) fetchPlayerData(id)
      }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [profiles, fetchPlayerData])

  const refreshProfiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/profiles')
      const data = await resp.json()
      setProfiles(data)
    } catch {
      // ignore
    }
  }, [])

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

  const hasValidProvider = providers.some(p => p.status === 'valid' || p.api_key)

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between h-12 px-3.5 bg-card border-b border-border">
        <div className="flex items-baseline gap-3">
          <h1 className="font-orbitron text-sm font-bold tracking-[1.5px] text-primary uppercase">
            ADMIRAL
          </h1>
          <span className="text-[11px] text-muted-foreground tracking-[1.5px] uppercase">SpaceMolt Agent Manager</span>
        </div>
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

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <div data-tour="sidebar" className="border-r border-border bg-card flex flex-col h-full">
            <ProfileList
              profiles={profiles}
              activeId={activeId}
              statuses={statuses}
              playerDataMap={playerDataMap}
              onSelect={setActiveId}
              onNew={handleNewProfile}
            />
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {activeProfile ? (
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
                <h2 className="font-orbitron text-xl font-bold tracking-[1.5px] text-primary uppercase mb-3">
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
