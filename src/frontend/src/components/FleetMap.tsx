import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Loader2, RefreshCw, Maximize2, Minimize2 } from 'lucide-react'
import type CameraControlsImpl from 'camera-controls'
import type { Profile } from '@/types'
import type { GalaxyMapData, GalaxySystem } from '@shared/galaxy-types'
import { FleetLegend } from './FleetLegend'
import { FleetIntelPanel } from './FleetIntelPanel'
import { resolveThemeColors, systemZ, type ThemeColors } from './fleet-map/galaxy-utils'
import { BackgroundStars } from './fleet-map/BackgroundStars'
import { Connections } from './fleet-map/Connections'
import { StarSystems } from './fleet-map/StarSystems'
import { AgentMarkers, type AgentPosition } from './fleet-map/AgentMarkers'
import { SystemPopup } from './fleet-map/SystemPopup'

interface Props {
  profiles: Profile[]
  statuses: Record<string, { connected: boolean; running: boolean }>
  playerDataMap: Record<string, Record<string, unknown>>
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}

export function FleetMap({ profiles, statuses, playerDataMap, fullscreen, onToggleFullscreen }: Props) {
  const [galaxyData, setGalaxyData] = useState<GalaxyMapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [colors, setColors] = useState<ThemeColors>(() => resolveThemeColors())
  const [selectedSystem, setSelectedSystem] = useState<GalaxySystem | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const controlsRef = useRef<CameraControlsImpl>(null)

  const systemById = useMemo(() => {
    if (!galaxyData) return new Map<string, GalaxySystem>()
    const m = new Map<string, GalaxySystem>()
    for (const s of galaxyData.systems) m.set(s.system_id, s)
    return m
  }, [galaxyData])

  const systemByName = useMemo(() => {
    if (!galaxyData) return new Map<string, GalaxySystem>()
    const m = new Map<string, GalaxySystem>()
    for (const s of galaxyData.systems) m.set(s.name, s)
    return m
  }, [galaxyData])

  const agentPositions: AgentPosition[] = useMemo(() => {
    const result: AgentPosition[] = []
    profiles.forEach((p, i) => {
      const pd = playerDataMap[p.id]
      if (!pd) return
      const player = (pd.player || {}) as Record<string, unknown>
      const location = (pd.location || {}) as Record<string, unknown>
      const sysName = String(player.current_system || location.system_name || pd.system || '')
      if (!sysName) return
      const sys = systemByName.get(sysName)
      if (!sys) return
      result.push({ profile: p, index: i, system: sys, running: statuses[p.id]?.running ?? false })
    })
    return result
  }, [profiles, playerDataMap, statuses, systemByName])

  const agentsAtSelected = useMemo(() => {
    if (!selectedSystem) return []
    return agentPositions.filter(ap => ap.system.system_id === selectedSystem.system_id)
  }, [selectedSystem, agentPositions])

  // Fetch galaxy data
  const fetchGalaxy = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      let resp = await fetch('/api/galaxy')
      if (resp.status === 404 || forceRefresh) {
        resp = await fetch('/api/galaxy/refresh', { method: 'POST' })
      }
      if (!resp.ok) throw new Error(`Failed: ${resp.status}`)
      const data: GalaxyMapData = await resp.json()
      setGalaxyData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGalaxy() }, [fetchGalaxy])

  // Theme observer
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(resolveThemeColors()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (fullscreen && onToggleFullscreen) onToggleFullscreen()
        else setSelectedSystem(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen, onToggleFullscreen])

  // Center on system (from legend click)
  const centerOnSystem = useCallback((systemName: string) => {
    const sys = systemByName.get(systemName)
    if (!sys || !controlsRef.current) return
    const z = systemZ(sys.system_id)
    // Fly camera to look at the system from a close-up angle
    controlsRef.current.setLookAt(
      sys.position.x + 1500, z + 2000, sys.position.y + 1500,
      sys.position.x, z, sys.position.y,
      true
    )
  }, [systemByName])

  const handleSelect = useCallback((sys: GalaxySystem) => {
    setSelectedSystem(prev => prev?.system_id === sys.system_id ? null : sys)
  }, [])

  const handleHover = useCallback((sys: GalaxySystem | null) => {
    setHoveredId(sys?.system_id ?? null)
  }, [])

  // Compute galaxy center for initial camera target
  const galaxyCenter = useMemo(() => {
    if (!galaxyData || galaxyData.systems.length === 0) return { x: 7000, y: 0, z: 7000 }
    let sumX = 0, sumY = 0, sumZ = 0
    for (const s of galaxyData.systems) {
      sumX += s.position.x
      sumZ += s.position.y // game y → three.js z
      sumY += systemZ(s.system_id)
    }
    const n = galaxyData.systems.length
    return { x: sumX / n, y: sumY / n, z: sumZ / n }
  }, [galaxyData])

  return (
    <div className="relative w-full h-full overflow-hidden bg-background">
      {galaxyData && galaxyData.systems.length > 0 && (
        <Canvas
          camera={{
            position: [galaxyCenter.x, galaxyCenter.y + 8000, galaxyCenter.z + 12000],
            fov: 50,
            near: 10,
            far: 100000,
          }}
          style={{ background: 'transparent' }}
          onPointerMissed={() => setSelectedSystem(null)}
        >
          <CameraControls
            ref={controlsRef}
            makeDefault
            minDistance={200}
            maxDistance={40000}
            dollySpeed={0.5}
          />
          <ambientLight intensity={0.8} />
          <BackgroundStars />
          <Connections systems={galaxyData.systems} systemById={systemById} colors={colors} />
          <StarSystems
            systems={galaxyData.systems}
            colors={colors}
            hoveredId={hoveredId}
            selectedId={selectedSystem?.system_id ?? null}
            onHover={handleHover}
            onSelect={handleSelect}
          />
          <AgentMarkers agents={agentPositions} colors={colors} />
          {selectedSystem && (
            <SystemPopup
              system={selectedSystem}
              agents={agentsAtSelected}
              colors={colors}
              onClose={() => setSelectedSystem(null)}
            />
          )}
        </Canvas>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-40">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading galaxy map...</span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-40">
          <span className="text-sm text-muted-foreground">Failed to load galaxy: {error}</span>
          <button onClick={() => fetchGalaxy(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-3">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      <FleetLegend
        profiles={profiles}
        statuses={statuses}
        playerDataMap={playerDataMap}
        onCenter={centerOnSystem}
      />

      <FleetIntelPanel />

      {/* Top-right controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
        {fullscreen && (
          <span className="text-[10px] uppercase tracking-[1.5px] text-primary/60 font-medium mr-2 select-none">War Room</span>
        )}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="flex items-center justify-center w-7 h-7 bg-card/80 border border-border text-muted-foreground hover:text-foreground transition-colors backdrop-blur-sm"
            title={fullscreen ? 'Exit war room (Esc)' : 'War room — full screen'}
          >
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-muted-foreground/60 select-none">
        <span>{galaxyData?.total_count || 0} systems</span>
        <button
          onClick={() => fetchGalaxy(true)}
          className="hover:text-muted-foreground transition-colors"
          title="Refresh galaxy data"
        >
          <RefreshCw size={10} />
        </button>
      </div>

      {!loading && !error && galaxyData && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground/40 select-none pointer-events-none">
          Left-drag to orbit · Right-drag to pan · Scroll to zoom · Click agents in Fleet panel to fly
        </div>
      )}
    </div>
  )
}
