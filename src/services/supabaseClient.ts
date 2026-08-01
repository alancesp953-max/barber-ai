import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and add your Supabase credentials.',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

// Monitora mudanças na autenticação
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Redireciona para o login se estiver em uma página admin
    if (window.location.pathname.startsWith('/admin')) {
      window.location.href = '/login'
    }
  }
})

/** Alias for named imports that prefer `supabaseClient`. */
export const supabaseClient = supabase

export default supabaseClient