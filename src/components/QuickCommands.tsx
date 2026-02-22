'use client'

import { Button } from '@/components/ui/button'

interface Props {
  onSend: (command: string, args?: Record<string, unknown>) => void
  disabled: boolean
}

const QUICK_COMMANDS = [
  { label: 'Status', command: 'get_status' },
  { label: 'Cargo', command: 'get_cargo' },
  { label: 'System', command: 'get_system' },
  { label: 'Ship', command: 'get_ship' },
  { label: 'POI', command: 'get_poi' },
  { label: 'Market', command: 'get_market' },
  { label: 'Skills', command: 'get_skills' },
  { label: 'Nearby', command: 'get_nearby_ships' },
  { label: 'Log', command: 'captains_log_list' },
]

export function QuickCommands({ onSend, disabled }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2 bg-card/50 border-b border-border/20 overflow-x-auto">
      <span className="font-jetbrains text-[10px] text-muted-foreground/40 uppercase tracking-wider shrink-0 mr-0.5">Quick</span>
      {QUICK_COMMANDS.map(q => (
        <Button
          key={q.command}
          variant="outline"
          size="sm"
          onClick={() => onSend(q.command)}
          disabled={disabled}
          className="text-[10px] font-jetbrains text-muted-foreground/70 hover:text-primary shrink-0"
        >
          {q.label}
        </Button>
      ))}
    </div>
  )
}
