'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { ProviderSetup } from '@/components/ProviderSetup'
import type { Profile, Provider } from '@/types'
import type { DisplayFormat } from '@/components/JsonHighlight'

export default function Home() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showProviderSetup, setShowProviderSetup] = useState(false)
  const [displayFormat, setDisplayFormat] = useState<DisplayFormat>('yaml')

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
      if (prefs.display_format === 'json' || prefs.display_format === 'yaml') {
        setDisplayFormat(prefs.display_format)
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

  const handleSetDisplayFormat = useCallback(async (fmt: DisplayFormat) => {
    setDisplayFormat(fmt)
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'display_format', value: fmt }),
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
        displayFormat={displayFormat}
        onDisplayFormatChange={handleSetDisplayFormat}
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
      displayFormat={displayFormat}
      onDisplayFormatChange={handleSetDisplayFormat}
      onRefresh={loadData}
      onShowProviders={() => setShowProviderSetup(true)}
    />
  )
}
