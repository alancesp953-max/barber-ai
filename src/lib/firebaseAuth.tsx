import { useState, useEffect, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, getFirebaseAuth, isFirebaseConfigured } from './firebase'
import type { UserProfile, Tenant } from '../types/database'

interface AuthContextType {
  currentUser: User | null
  userProfile: UserProfile | null
  tenant: Tenant | null
  loading: boolean
  isSuperAdmin: boolean
  login: (email: string, password: string) => Promise<UserProfile | null>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserProfile = async (user: User | null) => {
    if (!user) {
      setUserProfile(null)
      setTenant(null)
      setLoading(false)
      return
    }

    try {
      const userDocRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userDocRef)

      let profile: UserProfile

      // Se for o superadministrador oficial admin@barb.com
      if (user.email?.toLowerCase() === 'admin@barb.com') {
        if (userSnap.exists()) {
          profile = userSnap.data() as UserProfile
          profile.role = 'superadmin'
        } else {
          profile = {
            uid: user.uid,
            email: user.email,
            role: 'superadmin',
            name: 'Super Administrador',
            status: 'active',
            createdAt: new Date().toISOString(),
          }
        }
      } else if (userSnap.exists()) {
        profile = userSnap.data() as UserProfile
      } else {
        // Usuário sem perfil registrado
        profile = {
          uid: user.uid,
          email: user.email || '',
          role: 'tenant_admin',
          status: 'active',
          createdAt: new Date().toISOString(),
        }
      }

      setUserProfile(profile)

      // Se for tenant_admin ou barbeiro vinculado a um tenant, carrega os dados da barbearia
      if (profile.tenantId) {
        const tenantDocRef = doc(db, 'tenants', profile.tenantId)
        const tenantSnap = await getDoc(tenantDocRef)
        if (tenantSnap.exists()) {
          setTenant({ id: tenantSnap.id, ...tenantSnap.data() } as Tenant)
        } else {
          setTenant(null)
        }
      } else {
        setTenant(null)
      }
    } catch (err) {
      console.error('Erro ao carregar perfil do usuário:', err)
      // Fallback para admin@barb.com em caso de erro inicial de regras
      if (user.email?.toLowerCase() === 'admin@barb.com') {
        setUserProfile({
          uid: user.uid,
          email: user.email,
          role: 'superadmin',
          name: 'Super Administrador',
          status: 'active',
          createdAt: new Date().toISOString(),
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      await fetchUserProfile(user)
    })
    return () => unsubscribe()
  }, [])

  const login = async (email: string, password: string): Promise<UserProfile | null> => {
    setLoading(true)
    const cred = await signInWithEmailAndPassword(auth, email, password)
    await fetchUserProfile(cred.user)
    return userProfile
  }

  const logout = async () => {
    setLoading(true)
    await fbSignOut(auth)
    setCurrentUser(null)
    setUserProfile(null)
    setTenant(null)
    setLoading(false)
  }

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await fetchUserProfile(auth.currentUser)
    }
  }

  const isSuperAdmin =
    userProfile?.role === 'superadmin' ||
    currentUser?.email?.toLowerCase() === 'admin@barb.com'

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        tenant,
        loading,
        isSuperAdmin,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider')
  }
  return context
}

export type { AuthContextType }
export { isFirebaseConfigured, getFirebaseDb, getFirebaseAuth } from './firebase'

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
    const authClient = await getFirebaseAuth()
    onAuthStateChanged(authClient, async (user) => {
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
      const authClient = await getFirebaseAuth()
      await authClient.authStateReady()
      const user = authClient.currentUser
      if (!user) return { data: { session: null }, error: null }
      const token = await user.getIdToken()
      return { data: { session: toSession(user, token) }, error: null }
    },
    async getUser() {
      const authClient = await getFirebaseAuth()
      await authClient.authStateReady()
      const user = authClient.currentUser
      if (!user) return { data: { user: null }, error: null }
      return { data: { user: toUser(user) }, error: null }
    },
    async signInWithPassword(params: { email: string; password: string }) {
      try {
        const { signInWithEmailAndPassword } = await import('firebase/auth')
        const authClient = await getFirebaseAuth()
        const cred = await signInWithEmailAndPassword(authClient, params.email, params.password)
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
        const authClient = await getFirebaseAuth()
        const cred = await createUserWithEmailAndPassword(authClient, params.email, params.password)
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
        const authClient = await getFirebaseAuth()
        await authClient.authStateReady()
        const user = authClient.currentUser
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
