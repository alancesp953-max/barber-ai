import { createFirebaseAuthAdapter } from '../lib/firebaseAuth'
import { isDemoAvailable } from '../lib/demoAuth'
import { isFirebaseConfigured } from '../lib/firebase'
import { createMockSupabaseClient } from '../lib/mockSupabase'

export { isFirebaseConfigured }

/** Login e-mail/senha quando o Firebase Web está preenchido. */
export const isSupabaseConfigured = isFirebaseConfigured()
export const isDemoMode = !isFirebaseConfigured() && isDemoAvailable()

if (isFirebaseConfigured()) {
  console.info('Firebase ativo: Auth + Firestore (coleções barbeiros, agendamentos, servicos).')
} else {
  console.info(
    'Modo demonstração ativo: Firebase não configurado. O painel usa dados locais fictícios.',
  )
}

const dataClient = createMockSupabaseClient()

export const supabase = (
  isFirebaseConfigured()
    ? { ...dataClient, auth: createFirebaseAuthAdapter() }
    : dataClient
) as any

export const supabaseClient = supabase

export default supabaseClient

supabase.auth.onAuthStateChange((event: string) => {
  if (event === 'SIGNED_OUT') {
    if (window.location.pathname.startsWith('/admin') || window.location.pathname.startsWith('/barber')) {
      window.location.href = '/login'
    }
  }
})
