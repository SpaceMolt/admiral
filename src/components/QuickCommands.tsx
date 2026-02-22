'use client'

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
]

export function QuickCommands({ onSend, disabled }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-deep-void/50 border-b border-hull-grey/20 overflow-x-auto">
      <span className="font-jetbrains text-[10px] text-chrome-silver/40 uppercase shrink-0 mr-1">Quick:</span>
      {QUICK_COMMANDS.map(q => (
        <button
          key={q.command}
          onClick={() => onSend(q.command)}
          disabled={disabled}
          className="px-2 py-0.5 text-[10px] font-jetbrains text-chrome-silver/70 bg-nebula-blue/30 border border-hull-grey/20 rounded hover:border-plasma-cyan/50 hover:text-plasma-cyan transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          {q.label}
        </button>
      ))}
    </div>
  )
}
