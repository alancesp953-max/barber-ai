import { useState, useEffect, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider')
  }
  return context
}
