import { Hono } from 'hono'
import {
  listSchedules, getSchedule, upsertSchedule, deleteSchedule,
  listEventTriggers, upsertEventTrigger, deleteEventTrigger,
  getFleetOrders, deleteFleetOrder,
} from '../lib/db'
import { nextCronTime } from '../lib/scheduler'

const schedules = new Hono()

// --- Cron Schedules ---

schedules.get('/', (c) => {
  const profileId = c.req.query('profile_id')
  return c.json(listSchedules(profileId || undefined))
})

schedules.post('/', async (c) => {
  const body = await c.req.json()
  const { profile_id, cron, action, duration_hours, enabled } = body

  if (!profile_id || !cron) {
    return c.json({ error: 'profile_id and cron are required' }, 400)
  }

  // Validate cron
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    return c.json({ error: 'cron must be a 5-field expression (min hour dom mon dow)' }, 400)
  }

  const id = body.id || crypto.randomUUID()
  const next = nextCronTime(cron)

  upsertSchedule({
    id,
    profile_id,
    cron,
    action: action || 'connect_llm',
    duration_hours: duration_hours ?? null,
    enabled: enabled !== false,
    last_run_at: null,
    next_run_at: next?.toISOString() ?? null,
  })

  return c.json(getSchedule(id))
})

schedules.put('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = getSchedule(id)
  if (!existing) return c.json({ error: 'Schedule not found' }, 404)

  const body = await c.req.json()
  const cron = body.cron ?? existing.cron
  const next = nextCronTime(cron)

  upsertSchedule({
    id,
    profile_id: existing.profile_id,
    cron,
    action: body.action ?? existing.action,
    duration_hours: body.duration_hours !== undefined ? body.duration_hours : existing.duration_hours,
    enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
    last_run_at: existing.last_run_at,
    next_run_at: next?.toISOString() ?? null,
  })

  return c.json(getSchedule(id))
})

schedules.delete('/:id', (c) => {
  deleteSchedule(c.req.param('id'))
  return c.json({ ok: true })
})

// --- Event Triggers ---

schedules.get('/triggers', (c) => {
  const profileId = c.req.query('profile_id')
  return c.json(listEventTriggers(profileId || undefined))
})

schedules.post('/triggers', async (c) => {
  const body = await c.req.json()
  const { profile_id, event_type, action } = body

  if (!profile_id || !event_type) {
    return c.json({ error: 'profile_id and event_type are required' }, 400)
  }

  const id = body.id || crypto.randomUUID()

  upsertEventTrigger({
    id,
    profile_id,
    event_type,
    event_match: body.event_match ?? null,
    action: action || 'nudge',
    action_params: body.action_params ?? null,
    enabled: body.enabled !== false,
    last_fired_at: null,
  })

  return c.json({ id, ok: true })
})

schedules.delete('/triggers/:id', (c) => {
  deleteEventTrigger(c.req.param('id'))
  return c.json({ ok: true })
})

// --- Fleet Orders ---

schedules.get('/orders', (c) => {
  const profileId = c.req.query('profile_id')
  const status = c.req.query('status')
  return c.json(getFleetOrders({ toProfileId: profileId || undefined, status: status || undefined }))
})

schedules.get('/orders/all', (c) => {
  return c.json(getFleetOrders({}))
})

schedules.delete('/orders/:id', (c) => {
  deleteFleetOrder(c.req.param('id'))
  return c.json({ ok: true })
})

export default schedules
