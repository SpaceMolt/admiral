import { Hono } from 'hono'
import { getAllPreferences, setPreference } from '../lib/db'

const preferences = new Hono()

preferences.get('/', (c) => c.json(getAllPreferences()))

preferences.put('/', async (c) => {
  const { key, value } = await c.req.json()
  if (!key || typeof value !== 'string') return c.json({ error: 'Missing key or value' }, 400)
  setPreference(key, value)
  return c.json({ key, value })
})

export default preferences
