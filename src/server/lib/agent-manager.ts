import { Agent } from './agent'
import { getProfile, addLogEntry } from './db'

const BACKOFF_BASE = 5_000      // 5 seconds
const BACKOFF_MAX = 5 * 60_000  // 5 minutes
const BACKOFF_RESET = 60_000    // Reset backoff after 1 min of successful running

type SlimGameState = {
  credits?: unknown
  system?: unknown
  poi?: unknown
  ship?: {
    class?: unknown
    hull: string
    shield: string
    fuel: string
    cargo: string
    cargoItems?: string[]
  }
  modules?: { name?: unknown; wear?: unknown; ammo?: string }[]
} | null

function slimGameState(raw: Record<string, unknown> | null): SlimGameState {
  if (!raw) return null
  const gs = raw as Record<string, Record<string, unknown> & { cargo?: unknown[]; current_ammo?: unknown; magazine_size?: unknown }>
  const player = gs.player as Record<string, unknown> | undefined
  const ship = gs.ship as Record<string, unknown> & { cargo?: unknown[] } | undefined
  const modules = gs.modules as Array<Record<string, unknown>> | undefined
  return {
    credits: player?.credits,
    system: player?.current_system,
    poi: player?.current_poi,
    ship: ship ? {
      class: ship.class_id,
      hull: `${ship.hull ?? 0}/${ship.max_hull ?? 0}`,
      shield: `${ship.shield ?? 0}/${ship.max_shield ?? 0}`,
      fuel: `${ship.fuel ?? 0}/${ship.max_fuel ?? 0}`,
      cargo: `${ship.cargo_used ?? 0}/${ship.cargo_capacity ?? 0}`,
      cargoItems: (ship.cargo as Array<Record<string, unknown>> | undefined)
        ?.map(c => `${c.item_id} x${c.quantity}`),
    } : undefined,
    modules: modules?.map(m => ({
      name: m.name,
      wear: m.wear_status,
      ammo: m.current_ammo !== undefined ? `${m.current_ammo}/${m.magazine_size}` : undefined,
    })),
  }
}

class AgentManager {
  private agents = new Map<string, Agent>()
  private stopRequested = new Set<string>()
  private backoff = new Map<string, { attempts: number; timer: ReturnType<typeof setTimeout> | null }>()

  getAgent(profileId: string): Agent | undefined {
    return this.agents.get(profileId)
  }

  async connect(profileId: string): Promise<Agent> {
    // If already connected, return existing
    let agent = this.agents.get(profileId)
    if (agent?.isConnected) return agent

    // Create new agent
    agent = new Agent(profileId)
    this.agents.set(profileId, agent)

    await agent.connect()
    return agent
  }

  async startLLM(profileId: string): Promise<void> {
    const agent = this.agents.get(profileId)
    if (!agent) throw new Error('Agent not connected')
    if (agent.isRunning) return

    this.stopRequested.delete(profileId)
    this.resetBackoff(profileId)

    // Run in background (don't await)
    const loopStarted = Date.now()
    agent.startLLMLoop().then(() => {
      this.handleLoopExit(profileId, loopStarted)
    }).catch(() => {
      this.handleLoopExit(profileId, loopStarted)
    })
  }

  private handleLoopExit(profileId: string, loopStarted: number): void {
    if (this.stopRequested.has(profileId)) {
      this.resetBackoff(profileId)
      return
    }

    const profile = getProfile(profileId)
    if (!profile || !profile.enabled || !profile.provider || profile.provider === 'manual' || !profile.model) {
      return
    }

    const ranFor = Date.now() - loopStarted
    const bo = this.backoff.get(profileId) || { attempts: 0, timer: null }
    if (ranFor > BACKOFF_RESET) bo.attempts = 0

    bo.attempts++
    const delay = Math.min(BACKOFF_BASE * Math.pow(2, bo.attempts - 1), BACKOFF_MAX)
    this.backoff.set(profileId, bo)

    const delaySec = Math.round(delay / 1000)
    addLogEntry(profileId, 'system', `Agent loop exited unexpectedly. Auto-restarting in ${delaySec}s (attempt ${bo.attempts})`)

    bo.timer = setTimeout(async () => {
      if (this.stopRequested.has(profileId)) return
      try {
        let agent = this.agents.get(profileId)
        if (!agent || !agent.isConnected) {
          agent = new Agent(profileId)
          this.agents.set(profileId, agent)
          await agent.connect()
        }
        if (!agent.isRunning) {
          addLogEntry(profileId, 'system', `Auto-restart: reconnected, resuming LLM loop`)
          const restartedAt = Date.now()
          agent.startLLMLoop().then(() => {
            this.handleLoopExit(profileId, restartedAt)
          }).catch(() => {
            this.handleLoopExit(profileId, restartedAt)
          })
        }
      } catch (err) {
        addLogEntry(profileId, 'error', `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}`)
        this.handleLoopExit(profileId, Date.now())
      }
    }, delay)
  }

  private resetBackoff(profileId: string): void {
    const bo = this.backoff.get(profileId)
    if (bo?.timer) clearTimeout(bo.timer)
    this.backoff.delete(profileId)
  }

  async disconnect(profileId: string): Promise<void> {
    this.stopRequested.add(profileId)
    this.resetBackoff(profileId)

    const agent = this.agents.get(profileId)
    if (!agent) return

    await agent.stop()
    this.agents.delete(profileId)
  }

  restartTurn(profileId: string): void {
    const agent = this.agents.get(profileId)
    if (agent?.isRunning) {
      agent.restartTurn()
    }
  }

  nudge(profileId: string, message: string): void {
    const agent = this.agents.get(profileId)
    if (agent?.isRunning) {
      agent.injectNudge(message)
    }
  }

  getStatus(profileId: string): { connected: boolean; running: boolean; activity: string; gameState: SlimGameState } {
    const agent = this.agents.get(profileId)
    return {
      connected: agent?.isConnected ?? false,
      running: agent?.isRunning ?? false,
      activity: agent?.activity ?? 'idle',
      gameState: slimGameState(agent?.gameState ?? null),
    }
  }

  listActive(): string[] {
    return Array.from(this.agents.entries())
      .filter(([, agent]) => agent.isConnected)
      .map(([id]) => id)
  }
}

export const agentManager = new AgentManager()
