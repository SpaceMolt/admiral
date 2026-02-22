'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { ProviderSetup } from '@/components/ProviderSetup'
import type { Profile, Provider } from '@/types'

export default function Home() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showProviderSetup, setShowProviderSetup] = useState(false)
  const [registrationCode, setRegistrationCode] = useState('')
  const [gameserverUrl, setGameserverUrl] = useState('https://game.spacemolt.com')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [provRes, profRes, prefRes] = await Promise.all([
        fetch('/api/providers'),
        fetch('/api/profiles'),
        fetch('/api/preferences'),
      ])
      const provs: Provider[] = await provRes.json()
      const profs: Profile[] = await profRes.json()
      const prefs: Record<string, string> = await prefRes.json()
      setProviders(provs)
      setProfiles(profs)
      if (prefs.registration_code) {
        setRegistrationCode(prefs.registration_code)
      }
      if (prefs.gameserver_url) {
        setGameserverUrl(prefs.gameserver_url)
      }

      // Show provider setup if no profiles and no configured providers
      if (profs.length === 0 && !provs.some(p => p.status === 'valid')) {
        setShowProviderSetup(true)
      }
    } catch {
      // API not ready yet
    } finally {
      setLoading(false)
    }
  }

  const handleSetRegistrationCode = useCallback(async (code: string) => {
    setRegistrationCode(code)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'registration_code', value: code }),
      })
    } catch {
      // ignore
    }
  }, [])

  const handleSetGameserverUrl = useCallback(async (url: string) => {
    setGameserverUrl(url)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gameserver_url', value: url }),
      })
    } catch {
      // ignore
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground font-jetbrains text-sm">Loading Admiral...</div>
      </div>
    )
  }

  if (showProviderSetup) {
    return (
      <ProviderSetup
        providers={providers}
        registrationCode={registrationCode}
        onRegistrationCodeChange={handleSetRegistrationCode}
        gameserverUrl={gameserverUrl}
        onGameserverUrlChange={handleSetGameserverUrl}
        onDone={() => {
          setShowProviderSetup(false)
          loadData()
        }}
      />
    )
  }

  return (
    <Dashboard
      profiles={profiles}
      providers={providers}
      registrationCode={registrationCode}
      gameserverUrl={gameserverUrl}
      onRefresh={loadData}
      onShowProviders={() => setShowProviderSetup(true)}
    />
  )
}
