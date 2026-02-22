'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings } from 'lucide-react'
import type { Profile, Provider } from '@/types'
import { ProfileList } from './ProfileList'
import { ProfileEditor } from './ProfileEditor'
import { ProfileView } from './ProfileView'

interface Props {
  profiles: Profile[]
  providers: Provider[]
  onRefresh: () => void
  onShowProviders: () => void
}

export function Dashboard({ profiles: initialProfiles, providers, onRefresh, onShowProviders }: Props) {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [activeId, setActiveId] = useState<string | null>(initialProfiles[0]?.id || null)
  const [showEditor, setShowEditor] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [statuses, setStatuses] = useState<Record<string, { connected: boolean; running: boolean }>>({})

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

  async function handleCreateProfile(data: Partial<Profile>) {
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
        setShowEditor(false)
      }
    } catch {
      // ignore
    }
  }

  async function handleUpdateProfile(data: Partial<Profile>) {
    if (!editingProfile) return
    try {
      const resp = await fetch(`/api/profiles/${editingProfile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (resp.ok) {
        const updated = await resp.json()
        setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p))
        setShowEditor(false)
        setEditingProfile(null)
      }
    } catch {
      // ignore
    }
  }

  async function handleDeleteProfile(id: string) {
    try {
      await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      setProfiles(prev => prev.filter(p => p.id !== id))
      if (activeId === id) setActiveId(profiles.find(p => p.id !== id)?.id || null)
    } catch {
      // ignore
    }
  }

  const activeProfile = profiles.find(p => p.id === activeId)

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-deep-void border-b border-hull-grey/50">
        <h1 className="font-orbitron text-lg font-bold tracking-wider bg-gradient-to-r from-plasma-cyan to-shell-orange bg-clip-text text-transparent">
          ADMIRAL
        </h1>
        <button
          onClick={onShowProviders}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-jetbrains text-chrome-silver hover:text-plasma-cyan transition-colors"
        >
          <Settings size={14} />
          Providers
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <ProfileList
          profiles={profiles}
          activeId={activeId}
          statuses={statuses}
          onSelect={setActiveId}
          onNew={() => {
            setEditingProfile(null)
            setShowEditor(true)
          }}
        />

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {showEditor ? (
            <ProfileEditor
              profile={editingProfile}
              providers={providers}
              onSave={editingProfile ? handleUpdateProfile : handleCreateProfile}
              onCancel={() => {
                setShowEditor(false)
                setEditingProfile(null)
              }}
            />
          ) : activeProfile ? (
            <ProfileView
              profile={activeProfile}
              status={statuses[activeProfile.id] || { connected: false, running: false }}
              onEdit={() => {
                setEditingProfile(activeProfile)
                setShowEditor(true)
              }}
              onDelete={() => handleDeleteProfile(activeProfile.id)}
              onRefresh={() => {
                refreshProfiles()
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="font-orbitron text-xl text-plasma-cyan mb-2 tracking-wider">Welcome to Admiral</p>
                <p className="font-jetbrains text-sm text-chrome-silver">Create a profile to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
