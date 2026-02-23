'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { ProviderSetup } from '@/components/ProviderSetup'
import type { Profile, Provider } from '@/types'

export default function Home() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [registrationCode, setRegistrationCode] = useState('')
  const [gameserverUrl, setGameserverUrl] = useState('https://game.spacemolt.com')
  const [maxTurns, setMaxTurns] = useState(30)
  const [llmTimeout, setLlmTimeout] = useState(300)

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
      if (prefs.max_turns) {
        const v = parseInt(prefs.max_turns, 10)
        if (!isNaN(v) && v > 0) setMaxTurns(v)
      }
      if (prefs.llm_timeout) {
        const v = parseInt(prefs.llm_timeout, 10)
        if (!isNaN(v) && v > 0) setLlmTimeout(v)
      }

      // Show settings if no profiles and no configured providers
      if (profs.length === 0 && !provs.some(p => p.status === 'valid')) {
        setShowSettings(true)
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

  const handleSetMaxTurns = useCallback(async (turns: number) => {
    setMaxTurns(turns)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'max_turns', value: String(turns) }),
      })
    } catch {
      // ignore
    }
  }, [])

  const handleSetLlmTimeout = useCallback(async (seconds: number) => {
    setLlmTimeout(seconds)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'llm_timeout', value: String(seconds) }),
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

  return (
    <>
      <Dashboard
        profiles={profiles}
        providers={providers}
        registrationCode={registrationCode}
        gameserverUrl={gameserverUrl}
        onRefresh={loadData}
        onShowProviders={() => setShowSettings(true)}
      />
      {showSettings && (
        <ProviderSetup
          providers={providers}
          registrationCode={registrationCode}
          onRegistrationCodeChange={handleSetRegistrationCode}
          gameserverUrl={gameserverUrl}
          onGameserverUrlChange={handleSetGameserverUrl}
          maxTurns={maxTurns}
          onMaxTurnsChange={handleSetMaxTurns}
          llmTimeout={llmTimeout}
          onLlmTimeoutChange={handleSetLlmTimeout}
          onClose={() => {
            setShowSettings(false)
            loadData()
          }}
        />
      )}
    </>
  )
}
