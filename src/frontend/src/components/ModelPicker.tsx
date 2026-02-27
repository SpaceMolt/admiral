import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, ChevronDown } from 'lucide-react'

interface Props {
  provider: string
  value: string
  onChange: (v: string) => void
}

export function ModelPicker({ provider, value, onChange }: Props) {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`)
      const data = await resp.json()
      setModels(data.models || [])
    } catch {
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [provider])

  // Fetch models when provider changes
  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = filter
    ? models.filter(m => m.toLowerCase().includes(filter.toLowerCase()))
    : models

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          ref={inputRef}
          value={open ? filter : value}
          onChange={e => {
            if (open) {
              setFilter(e.target.value)
            } else {
              onChange(e.target.value)
            }
          }}
          onFocus={() => {
            setOpen(true)
            setFilter(value)
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
            if (e.key === 'Enter' && open) {
              e.preventDefault()
              if (filtered.length === 1) {
                onChange(filtered[0])
              } else if (filter) {
                onChange(filter)
              }
              setOpen(false)
            }
          }}
          placeholder="e.g. claude-sonnet-4-20250514"
          className="flex h-9 w-full bg-background border border-input px-2.5 py-1.5 text-sm font-jetbrains text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px]"
        />
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false)
            } else {
              setOpen(true)
              setFilter(value)
              inputRef.current?.focus()
            }
          }}
          className="flex items-center justify-center w-8 h-9 border border-l-0 border-input bg-background text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} />}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-background border border-border shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={11} className="animate-spin" /> Loading models...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {models.length === 0 ? 'No models found. Type a model ID manually.' : 'No matches. Press Enter to use typed value.'}
            </div>
          ) : (
            filtered.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(m); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-jetbrains hover:bg-primary/10 transition-colors ${
                  m === value ? 'text-primary bg-primary/5' : 'text-foreground'
                }`}
              >
                {m}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
