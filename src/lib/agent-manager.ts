import { Agent } from './agent'

class AgentManager {
  private agents = new Map<string, Agent>()

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

    // Run in background (don't await)
    agent.startLLMLoop().catch(() => {
      // Loop ended (normal or error) -- agent handles logging
    })
  }

  async disconnect(profileId: string): Promise<void> {
    const agent = this.agents.get(profileId)
    if (!agent) return

    await agent.stop()
    this.agents.delete(profileId)
  }

  getStatus(profileId: string): { connected: boolean; running: boolean } {
    const agent = this.agents.get(profileId)
    return {
      connected: agent?.isConnected ?? false,
      running: agent?.isRunning ?? false,
    }
  }

  listActive(): string[] {
    return Array.from(this.agents.entries())
      .filter(([, agent]) => agent.isConnected)
      .map(([id]) => id)
  }
}

// Persist singleton across HMR in development
const globalForAgentManager = globalThis as unknown as { __agentManager?: AgentManager }
export const agentManager = globalForAgentManager.__agentManager || new AgentManager()
globalForAgentManager.__agentManager = agentManager
