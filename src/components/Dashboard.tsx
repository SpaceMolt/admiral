'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Sun, Moon, Github } from 'lucide-react'
import { useQueryState } from 'nuqs'
import type { Profile, Provider } from '@/types'
import { ProfileList } from './ProfileList'
import { ProfileView } from './ProfileView'

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

  // Poll statuses
  useEffect(() => {
    async function poll() {
      for (const p of profiles) {
        try {
          const resp = await fetch(`/api/profiles/${p.id}`)
          const data = await resp.json()
          setStatuses(prev => ({ ...prev, [p.id]: { connected: !!data.connected, running: !!data.running } }))
        } catch {
          // ignore
        }
      }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [profiles])

  const refreshProfiles = useCallback(async () => {
    try {
      const resp = await fetch('/api/profiles')
      const data = await resp.json()
      setProfiles(data)
    } catch {
      // ignore
    }
  }, [])

  async function handleNewProfile() {
    const mostRecent = profiles.length > 0 ? profiles[profiles.length - 1] : null
    const data: Partial<Profile> = {
      name: 'New Profile',
      connection_mode: mostRecent?.connection_mode || 'http',
      provider: mostRecent?.provider || null,
      model: mostRecent?.model || null,
      server_url: gameserverUrl,
    }
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
        setAutoEditName(true)
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

  const activeProfile = profiles.find(p => p.id === activeId)

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
        <ProfileList
          profiles={profiles}
          activeId={activeId}
          statuses={statuses}
          playerDataMap={playerDataMap}
          onSelect={setActiveId}
          onNew={handleNewProfile}
        />

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
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="font-orbitron text-heading text-primary mb-2 tracking-tight">Welcome to Admiral</p>
                <p className="text-[13px] text-muted-foreground">Create a profile to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>
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
