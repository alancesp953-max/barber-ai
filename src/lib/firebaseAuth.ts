import type { User } from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from './firebase'

type AuthListener = (event: string, session: Record<string, unknown> | null) => void

function toUser(user: User) {
  return {
    id: user.uid,
    email: user.email,
    app_metadata: { provider: 'firebase', role: 'authenticated' },
    user_metadata: {
      full_name: user.displayName || '',
      name: user.displayName || '',
    },
    aud: 'authenticated',
    created_at: user.metadata.creationTime || new Date().toISOString(),
  }
}

function toSession(user: User, accessToken: string) {
  return {
    access_token: accessToken,
    refresh_token: user.refreshToken,
    token_type: 'bearer' as const,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: toUser(user),
  }
}

function wrapError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Falha na autenticação Firebase.'
  return { data: { user: null, session: null }, error: { message } }
}

export function createFirebaseAuthAdapter() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase Auth indisponível sem VITE_FIREBASE_*.')
  }
  const listeners = new Set<AuthListener>()
  let started = false

  async function ensureListener() {
    if (started) return
    started = true
    const { onAuthStateChanged } = await import('firebase/auth')
    const auth = await getFirebaseAuth()
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        listeners.forEach((listener) => listener('SIGNED_OUT', null))
        return
      }
      const token = await user.getIdToken()
      listeners.forEach((listener) => listener('SIGNED_IN', toSession(user, token)))
    })
  }

  void ensureListener()

  return {
    async getSession() {
      const auth = await getFirebaseAuth()
      await auth.authStateReady()
      const user = auth.currentUser
      if (!user) return { data: { session: null }, error: null }
      const token = await user.getIdToken()
      return { data: { session: toSession(user, token) }, error: null }
    },
    async getUser() {
      const auth = await getFirebaseAuth()
      await auth.authStateReady()
      const user = auth.currentUser
      if (!user) return { data: { user: null }, error: null }
      return { data: { user: toUser(user) }, error: null }
    },
    async signInWithPassword(params: { email: string; password: string }) {
      try {
        const { signInWithEmailAndPassword } = await import('firebase/auth')
        const auth = await getFirebaseAuth()
        const cred = await signInWithEmailAndPassword(auth, params.email, params.password)
        const token = await cred.user.getIdToken()
        return { data: { user: toUser(cred.user), session: toSession(cred.user, token) }, error: null }
      } catch (err) {
        return wrapError(err)
      }
    },
    async signUp(params: {
      email: string
      password: string
      options?: { data?: { full_name?: string } }
    }) {
      try {
        const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
        const auth = await getFirebaseAuth()
        const cred = await createUserWithEmailAndPassword(auth, params.email, params.password)
        const fullName = params.options?.data?.full_name
        if (fullName) await updateProfile(cred.user, { displayName: fullName })
        const token = await cred.user.getIdToken()
        return { data: { user: toUser(cred.user), session: toSession(cred.user, token) }, error: null }
      } catch (err) {
        return wrapError(err)
      }
    },
    async signOut() {
      const { signOut } = await import('firebase/auth')
      await signOut(await getFirebaseAuth())
      return { error: null }
    },
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener)
      void (async () => {
        await ensureListener()
        const auth = await getFirebaseAuth()
        await auth.authStateReady()
        const user = auth.currentUser
        if (!user) {
          listener('INITIAL_SESSION', null)
          return
        }
        const token = await user.getIdToken()
        listener('INITIAL_SESSION', toSession(user, token))
      })()
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } }, error: null }
    },
  }
}
