import { describe, it, expect } from 'bun:test'
import { executeTool, type LogFn } from './tools'
import type { GameConnection } from './connections/interface'

function mockConnection(): GameConnection {
  return {
    mode: 'http_v2' as any,
    connect: async () => {},
    login: async () => ({ success: true }),
    register: async () => ({ success: true, username: 'test', password: 'test', player_id: 'test', empire: 'test' }),
    execute: async () => ({ result: { message: 'ok' } }),
    onNotification: () => {},
    disconnect: async () => {},
    isConnected: () => true,
  }
}

function captureLog(): { entries: { type: string; summary: string }[]; fn: LogFn } {
  const entries: { type: string; summary: string }[] = []
  const fn: LogFn = (type, summary) => { entries.push({ type, summary }) }
  return { entries, fn }
}

function makeCtx(log: LogFn) {
  return {
    connection: mockConnection(),
    profileId: 'test-profile',
    log,
    todo: '',
  }
}

describe('tool call log formatting — no trailing ", )"', () => {
  it('game command with no args field', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'travel' }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(travel)')
  })

  it('game command with empty args object', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'travel', args: {} }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(travel)')
  })

  it('game command with args=undefined', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'mine', args: undefined }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('game command with args=null', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'mine', args: null }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('game command with args containing only undefined values', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'mine', args: { target: undefined } }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('game command with args containing only null values', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'mine', args: { target: null } }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('game command with valid args', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'travel', args: { target_system: 'Sol' } }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(travel, target_system=Sol)')
  })

  it('game command with args=[]', async () => {
    const { entries, fn } = captureLog()
    await executeTool('game', { command: 'mine', args: [] as any }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('direct tool call with no args', async () => {
    const { entries, fn } = captureLog()
    await executeTool('mine', {}, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(mine)')
  })

  it('direct tool call with args', async () => {
    const { entries, fn } = captureLog()
    await executeTool('travel', { target_system: 'Sol' }, makeCtx(fn))
    const tc = entries.find(e => e.type === 'tool_call')!
    expect(tc.summary).toBe('game(travel, target_system=Sol)')
  })

  it('never produces ", )" for any edge case input', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['game', { command: 'mine' }],
      ['game', { command: 'mine', args: {} }],
      ['game', { command: 'mine', args: undefined } as any],
      ['game', { command: 'mine', args: null } as any],
      ['game', { command: 'mine', args: [] } as any],
      ['game', { command: 'mine', args: false } as any],
      ['game', { command: 'mine', args: 0 } as any],
      ['game', { command: 'mine', args: '' } as any],
      ['game', { command: 'travel', args: { target: '' } }],
      ['mine', {}],
      ['get_status', {}],
    ]
    for (const [name, args] of cases) {
      const { entries, fn } = captureLog()
      await executeTool(name, args, makeCtx(fn))
      const tc = entries.find(e => e.type === 'tool_call')
      expect(tc).toBeDefined()
      expect(tc!.summary).not.toContain(', )')
    }
  })
})
