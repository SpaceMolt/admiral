/**
 * Claude MAX OAuth token management.
 * Reads tokens from Claude Code's local credential storage (~/.claude/.credentials.json)
 * and handles automatic refresh when expired.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json')
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const CLIENT_ID = atob('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl')

interface ClaudeOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  subscriptionType: string
  rateLimitTier: string
}

interface CredentialsFile {
  claudeAiOauth: ClaudeOAuthCredentials
}

let cachedCredentials: ClaudeOAuthCredentials | null = null
let refreshInFlight: Promise<ClaudeOAuthCredentials> | null = null

function readCredentialsFile(): CredentialsFile | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
    const data = JSON.parse(raw) as CredentialsFile
    if (data?.claudeAiOauth?.accessToken && data?.claudeAiOauth?.refreshToken) {
      return data
    }
    return null
  } catch {
    return null
  }
}

function writeCredentialsFile(creds: ClaudeOAuthCredentials): void {
  try {
    const existing = readCredentialsFile() || { claudeAiOauth: {} }
    existing.claudeAiOauth = creds
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(existing), 'utf-8')
  } catch {
    // Best-effort — don't crash if we can't write back
  }
}

async function refreshToken(refreshToken: string): Promise<ClaudeOAuthCredentials> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude MAX token refresh failed: ${error}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const updated: ClaudeOAuthCredentials = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
    scopes: cachedCredentials?.scopes || ['user:inference'],
    subscriptionType: cachedCredentials?.subscriptionType || 'max',
    rateLimitTier: cachedCredentials?.rateLimitTier || 'default_claude_max_20x',
  }

  // Persist refreshed token back to disk so Claude Code stays in sync
  writeCredentialsFile(updated)
  cachedCredentials = updated

  return updated
}

/**
 * Check if Claude MAX credentials are available on this machine.
 */
export function isClaudeMaxAvailable(): boolean {
  const file = readCredentialsFile()
  return file !== null
}

/**
 * Get a valid Claude MAX OAuth access token.
 * Reads from ~/.claude/.credentials.json, refreshes if expired.
 * The returned token starts with "sk-ant-oat" which pi-ai auto-detects
 * for Bearer auth + Claude Code headers.
 */
export async function getClaudeMaxToken(): Promise<string> {
  // Re-read from disk each time so we pick up tokens refreshed by Claude Code
  const file = readCredentialsFile()
  if (!file) {
    throw new Error(
      'Claude MAX credentials not found. Run "claude auth login" in your terminal first.'
    )
  }

  // Use disk version if it has a newer/valid token (e.g., refreshed by Claude Code)
  const diskCreds = file.claudeAiOauth
  const now = Date.now()

  if (diskCreds.expiresAt > now + 60_000) {
    cachedCredentials = diskCreds
    return diskCreds.accessToken
  }

  // Token expired — refresh, but deduplicate concurrent requests
  if (refreshInFlight) {
    const result = await refreshInFlight
    return result.accessToken
  }

  const refreshTokenValue = diskCreds.refreshToken
  refreshInFlight = refreshToken(refreshTokenValue).finally(() => {
    refreshInFlight = null
  })

  try {
    cachedCredentials = await refreshInFlight
    return cachedCredentials.accessToken
  } catch (err) {
    // If refresh fails, try re-reading disk in case another process refreshed
    const retry = readCredentialsFile()
    if (retry && retry.claudeAiOauth.expiresAt > Date.now() + 60_000) {
      cachedCredentials = retry.claudeAiOauth
      return cachedCredentials.accessToken
    }
    throw err
  }
}

/**
 * Get subscription info for display purposes.
 */
export function getClaudeMaxInfo(): { available: boolean; subscriptionType?: string; rateLimitTier?: string } {
  const file = readCredentialsFile()
  if (!file) return { available: false }
  return {
    available: true,
    subscriptionType: file.claudeAiOauth.subscriptionType,
    rateLimitTier: file.claudeAiOauth.rateLimitTier,
  }
}
