import { createFirebaseAuthAdapter } from '../lib/firebaseAuth'
import { isFirebaseConfigured } from '../lib/firebase'
import { createMockSupabaseClient } from '../lib/mockSupabase'

export { isFirebaseConfigured }

/** O painel público usa Firebase Auth. Não depende de VITE_SUPABASE_* nem de VITE_FIREBASE_* no build. */
export const isSupabaseConfigured = true
export const isDemoMode = false

console.info('Firebase ativo: Auth + Firestore.')

const dataClient = createMockSupabaseClient()

export const supabase = {
  ...dataClient,
  auth: createFirebaseAuthAdapter(),
} as any

export const supabaseClient = supabase

export default supabaseClient

supabase.auth.onAuthStateChange((event: string) => {
  if (event === 'SIGNED_OUT') {
    if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/barber')) {
      window.location.href = '/login'
    }
  }
})
