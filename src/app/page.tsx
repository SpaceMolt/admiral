'use client'

import { useState, useEffect } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { ProviderSetup } from '@/components/ProviderSetup'
import type { Profile, Provider } from '@/types'

export default function Home() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showProviderSetup, setShowProviderSetup] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [provRes, profRes] = await Promise.all([
        fetch('/api/providers'),
        fetch('/api/profiles'),
      ])
      const provs: Provider[] = await provRes.json()
      const profs: Profile[] = await profRes.json()
      setProviders(provs)
      setProfiles(profs)

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
      onRefresh={loadData}
      onShowProviders={() => setShowProviderSetup(true)}
    />
  )
}
