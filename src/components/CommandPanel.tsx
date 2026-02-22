'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'

interface Props {
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
}

export function CommandPanel({ onSend, disabled }: Props) {
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!command.trim()) return

    let args: Record<string, unknown> | undefined
    if (argsStr.trim()) {
      try {
        args = JSON.parse(argsStr.trim())
      } catch {
        // Try simple key=value parsing
        args = {}
        for (const part of argsStr.split(',')) {
          const [k, ...v] = part.split('=')
          if (k && v.length) {
            const val = v.join('=').trim()
            try { args[k.trim()] = JSON.parse(val) } catch { args[k.trim()] = val }
          }
        }
      }
    }

    onSend(command.trim(), args)
    setCommand('')
    setArgsStr('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-2 bg-deep-void border-b border-hull-grey/30">
      <span className="font-jetbrains text-[10px] text-chrome-silver/40 uppercase tracking-wider shrink-0">Cmd</span>
      <input
        value={command}
        onChange={e => setCommand(e.target.value)}
        placeholder="get_status"
        disabled={disabled}
        className="flex-[2] min-w-0 bg-space-black border border-hull-grey/30 rounded px-2.5 py-1.5 text-xs font-jetbrains text-star-white placeholder:text-hull-grey/50 focus:border-plasma-cyan focus:outline-none disabled:opacity-40"
      />
      <span className="font-jetbrains text-[10px] text-chrome-silver/40 uppercase tracking-wider shrink-0">Args</span>
      <input
        value={argsStr}
        onChange={e => setArgsStr(e.target.value)}
        placeholder='{"key": "value"}'
        disabled={disabled}
        className="flex-[3] min-w-0 bg-space-black border border-hull-grey/30 rounded px-2.5 py-1.5 text-xs font-jetbrains text-star-white placeholder:text-hull-grey/50 focus:border-plasma-cyan focus:outline-none disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={disabled || !command.trim()}
        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-nebula-blue border border-hull-grey/40 rounded text-xs font-jetbrains text-chrome-silver hover:border-plasma-cyan hover:text-plasma-cyan transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <Send size={12} />
        Send
      </button>
    </form>
  )
}
