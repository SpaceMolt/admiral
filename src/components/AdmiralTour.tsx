'use client'

import { useEffect } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

interface Props {
  onComplete: () => void
}

const TOUR_STEPS: DriveStep[] = [
  {
    element: '[data-tour="navbar"]',
    popover: {
      title: 'INLINE EDITING',
      description: 'Everything in this bar is clickable. Edit the profile name, player credentials (@username), connection mode (HTTP/WS/MCP), and the LLM provider/model/context budget -- all inline. The panel icon on the left toggles the profile list.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="connect-btn"]',
    popover: {
      title: 'CONNECT',
      description: 'Log into the SpaceMolt gameserver. With an LLM provider set, your agent starts playing autonomously. In manual mode, you send commands yourself.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '[data-tour="directive"]',
    popover: {
      title: 'AGENT DIRECTIVE',
      description: 'Give your AI a goal: "mine ore and sell it", "explore unknown systems", "become a pirate". The agent pursues this directive every turn.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="quick-commands"]',
    popover: {
      title: 'QUICK COMMANDS',
      description: 'One-click buttons for common queries: player status, cargo, nearby ships, market prices. Results stream into the activity log below.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '[data-tour="nudge-btn"]',
    popover: {
      title: 'NUDGE',
      description: 'Send a one-time hint to your running agent without changing its directive. Press Enter as a shortcut. Supports up/down arrow history like a shell.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-tour="log-pane"]',
    popover: {
      title: 'ACTIVITY LOG',
      description: 'Real-time stream of everything your agent does: LLM reasoning, tool calls, server responses. Click any row to expand full details. Filter by type using the tabs above.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '[data-tour="side-pane"]',
    popover: {
      title: 'SIDE PANEL',
      description: 'Server-side player status, captain\'s log entries, and local TODO notes. Use the panel icon in the quick commands bar to show or hide this panel. Drag the divider to resize.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-tour="sidebar"]',
    popover: {
      title: 'PROFILES',
      description: 'Each profile is an independent agent with its own credentials, provider, and directives. Status dots show: grey = offline, orange = connected, green = agent running. Click + to create more. This panel can be collapsed using the icon in the top bar.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="command-panel"]',
    popover: {
      title: 'COMMAND INPUT',
      description: 'Type game commands directly with autocomplete. Works alongside or instead of the AI agent. Press any key to focus this input automatically.',
      side: 'top',
      align: 'center',
    },
  },
]

export function AdmiralTour({ onComplete }: Props) {
  useEffect(() => {
    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: 'hsl(213 16% 6% / 0.75)',
      stagePadding: 8,
      stageRadius: 0,
      popoverClass: 'admiral-tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Start Playing',
      onDestroyed: () => {
        onComplete()
      },
      steps: TOUR_STEPS,
    })

    d.drive()

    return () => {
      d.destroy()
    }
    // onComplete is stable (from Dashboard), safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
