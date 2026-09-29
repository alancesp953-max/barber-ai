const SESSION_KEY = 'barber-ai:demo-session'

export type DemoRole = 'admin' | 'barber'

export const DEMO_ADMIN_USER = {
  id: 'demo-user-admin',
  email: 'admin@demo.local',
  app_metadata: { provider: 'demo', role: 'admin' },
  user_metadata: { full_name: 'Admin Demo', name: 'Admin Demo' },
  aud: 'authenticated',
  created_at: '2026-01-01T12:00:00.000Z',
}

export const DEMO_BARBER_USER = {
  id: 'demo-user-barbeiro',
  email: 'barbeiro@demo.local',
  app_metadata: { provider: 'demo', role: 'barber' },
  user_metadata: { full_name: 'Marcos Correia', name: 'Marcos Correia' },
  aud: 'authenticated',
  created_at: '2026-01-01T12:00:00.000Z',
}

export type DemoUser = typeof DEMO_ADMIN_USER

export type DemoSession = {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  expires_at: number
  user: DemoUser
}

function userForRole(role: DemoRole): DemoUser {
  return role === 'barber' ? DEMO_BARBER_USER : DEMO_ADMIN_USER
}

/** Login público é sempre Firebase Auth. Ausência de VITE_* no build da Vercel não abre o modo demonstração. */
export function isDemoAvailable() {
  return false
}

export function buildDemoSession(role: DemoRole): DemoSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: `demo-token-${role}`,
    refresh_token: `demo-refresh-${role}`,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: now + 60 * 60 * 24,
    user: userForRole(role),
  }
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DemoSession
    if (!parsed?.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

export function setDemoSession(role: DemoRole): DemoSession {
  const session = buildDemoSession(role)
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearDemoSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function demoRoleFromEmail(email: string): DemoRole | null {
  const value = email.trim().toLowerCase()
  if (value === DEMO_ADMIN_USER.email) return 'admin'
  if (value === DEMO_BARBER_USER.email) return 'barber'
  return null
}
